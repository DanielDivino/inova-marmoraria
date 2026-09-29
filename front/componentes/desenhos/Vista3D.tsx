'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cotasDaPeca, edgePoint, featureContour, inside, sampleContour, type Feature, type Piece, type TechnicalDocument } from '@inova/domain/technical';
import { urlImagem } from './operacoes';

/** mm → m (a cena 3D trabalha em metros). */
const m = (mm: number) => mm / 1000;
const rad = (graus: number) => graus * Math.PI / 180;
const FUROS: Feature['type'][] = ['CUTOUT', 'HOLE', 'SINK', 'SCULPTED_SINK'];
type Cena = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; conteudo: THREE.Group; grade: THREE.GridHelper; texturas: Map<string, THREE.Texture>; desenhar: () => void; enquadrado: boolean };

/** Descarta geometrias, materiais e mapas (cópias de textura) de tudo o que está no grupo. */
function esvaziar(grupo: THREE.Object3D) {
  grupo.traverse((objeto) => {
    const malha = objeto as THREE.Mesh;
    malha.geometry?.dispose();
    for (const material of ([] as THREE.Material[]).concat(malha.material ?? [])) { (material as THREE.MeshStandardMaterial).map?.dispose(); material.dispose(); }
  });
  grupo.clear();
}

/** Material da pedra: foto do catálogo (escala e direção dos veios da peça) ou cor neutra. */
function materialDaPedra(peca: Piece, cena: Cena) {
  const material = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: peca.material?.roughness ?? .25, metalness: 0 });
  const url = urlImagem(peca.material?.imageUrl);
  if (url) {
    let base = cena.texturas.get(url);
    if (!base) { base = new THREE.TextureLoader().load(url, () => cena.desenhar()); base.colorSpace = THREE.SRGBColorSpace; cena.texturas.set(url, base); }
    const mapa = base.clone();
    mapa.wrapS = mapa.wrapT = THREE.RepeatWrapping;
    const tamanho = m(peca.material?.textureScaleMm ?? 600);
    mapa.repeat.set(1 / tamanho, 1 / tamanho);
    mapa.rotation = rad(peca.material?.veinRotationDeg ?? 0);
    material.map = mapa; material.color.set(0xffffff);
  }
  return material;
}

/**
 * Uma peça em 3D: contorno extrudado na espessura (arcos amostrados), furos das
 * cubas/recortes/furos, cuba como caixa aberta embaixo, rodabanca em pé sobre a
 * borda, saia pendurada para fora e acabamento como linha na aresta.
 */
function montarPeca(peca: Piece, recursos: Feature[], cena: Cena) {
  const grupo = new THREE.Group();
  grupo.position.set(m(peca.x), m(peca.z), -m(peca.y));
  grupo.rotation.y = rad(-peca.rotationDeg);
  const contorno = sampleContour(peca.contour, 2);
  const forma = new THREE.Shape(contorno.map((p) => new THREE.Vector2(m(p.x), m(p.y))));
  for (const recurso of recursos.filter((entrada) => FUROS.includes(entrada.type))) {
    const furo = sampleContour(featureContour(recurso), 2);
    // Furo fora da peça quebraria a triangulação: fica de fora (a conferência já aponta).
    if (furo.every((p) => inside(p, contorno))) forma.holes.push(new THREE.Path(furo.map((p) => new THREE.Vector2(m(p.x), m(p.y)))));
  }
  const espessura = m(peca.thicknessMm);
  const pedra = materialDaPedra(peca, cena);
  const placa = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: false, curveSegments: 1 }), pedra);
  // A forma é desenhada no plano XY; girar -90° em X a deita (y da planta → -z) e a espessura sobe em Y.
  placa.rotation.x = -Math.PI / 2 + rad(peca.tiltDeg);
  grupo.add(placa);

  const normais = new Map(cotasDaPeca(peca).map((cota) => [cota.ladoId, cota.normal]));
  for (const recurso of recursos) {
    if ((recurso.type === 'SINK' || recurso.type === 'SCULPTED_SINK') && !peca.tiltDeg) {
      // Caixa com as faces de dentro visíveis: de cima parece uma cuba aberta.
      const profundidade = m(recurso.depthMm);
      const bacia = new THREE.Mesh(new THREE.BoxGeometry(m(recurso.widthMm), profundidade, m(recurso.lengthMm)),
        recurso.type === 'SINK' ? new THREE.MeshStandardMaterial({ color: 0xe9edef, roughness: .2, metalness: .35, side: THREE.BackSide }) : Object.assign(pedra.clone(), { side: THREE.BackSide }));
      bacia.position.set(m(recurso.x), -profundidade / 2 + .0005, -m(recurso.y));
      bacia.rotation.y = rad(-recurso.rotationDeg);
      grupo.add(bacia);
      continue;
    }
    if (!recurso.edgeId || !['BACKSPLASH', 'SKIRT', 'EDGE_FINISH'].includes(recurso.type)) continue;
    const a = edgePoint(peca, recurso.edgeId, recurso.startMm), b = edgePoint(peca, recurso.edgeId, recurso.startMm + recurso.extentMm);
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    const n = normais.get(recurso.edgeId);
    if (!n || comprimento < 1) continue;
    const angulo = Math.atan2(b.y - a.y, b.x - a.x);
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (recurso.type === 'EDGE_FINISH') {
      const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m(a.x), espessura + .001, -m(a.y)), new THREE.Vector3(m(b.x), espessura + .001, -m(b.y))]), new THREE.LineBasicMaterial({ color: 0xb6811e }));
      grupo.add(linha);
      continue;
    }
    const grossura = Math.max(recurso.thicknessMm, 10), altura = m(recurso.heightMm);
    // Rodabanca: em pé sobre a peça, com a face de fora rente à borda. Saia: pendurada por fora da borda.
    const lado = recurso.type === 'BACKSPLASH' ? -1 : 1;
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(m(comprimento), altura, m(grossura)), pedra);
    faixa.position.set(m(meio.x + n.x * lado * grossura / 2), recurso.type === 'BACKSPLASH' ? espessura + altura / 2 : espessura - altura / 2, -m(meio.y + n.y * lado * grossura / 2));
    faixa.rotation.y = angulo;
    grupo.add(faixa);
  }
  return grupo;
}

function enquadrar(cena: Cena) {
  const caixa = new THREE.Box3().setFromObject(cena.conteudo);
  if (caixa.isEmpty()) return;
  const centro = caixa.getCenter(new THREE.Vector3()), tamanho = caixa.getSize(new THREE.Vector3());
  // Distância para caber o maior lado no campo de visão, também em telas estreitas (celular, lado a lado).
  const maior = Math.max(tamanho.x, tamanho.z, .6);
  const distancia = maior * .75 / Math.tan(rad(cena.camera.fov / 2)) / Math.min(1, cena.camera.aspect);
  const direcao = new THREE.Vector3(.5, .7, .9).normalize();
  cena.controls.target.copy(centro);
  cena.camera.position.copy(centro).addScaledVector(direcao, distancia);
  cena.controls.update();
}

/**
 * Vista 3D do desenho (three.js). Girar com um dedo/mouse, zoom com pinça ou
 * roda, arrastar com dois dedos. Desenha só quando algo muda (poupa bateria) e
 * descarta tudo ao sair.
 */
export default function Vista3D({ documento }: { documento: TechnicalDocument }) {
  const recipiente = useRef<HTMLDivElement | null>(null);
  const cena = useRef<Cena | null>(null);

  useEffect(() => {
    const elemento = recipiente.current;
    if (!elemento) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(elemento.clientWidth, elemento.clientHeight);
    elemento.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, elemento.clientWidth / Math.max(1, elemento.clientHeight), .01, 300);
    camera.position.set(2.5, 2.5, 3.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.maxPolarAngle = Math.PI * .495;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b80, 1.25));
    const sol = new THREE.DirectionalLight(0xffffff, 1.7); sol.position.set(3, 7, 5); scene.add(sol);
    const grade = new THREE.GridHelper(20, 40);
    (grade.material as THREE.LineBasicMaterial).vertexColors = false;
    scene.add(grade);
    const conteudo = new THREE.Group(); scene.add(conteudo);
    const desenhar = () => renderer.render(scene, camera);
    controls.addEventListener('change', desenhar);
    const observador = new ResizeObserver(() => {
      const largura = elemento.clientWidth, altura = Math.max(1, elemento.clientHeight);
      renderer.setSize(largura, altura); camera.aspect = largura / altura; camera.updateProjectionMatrix(); desenhar();
    });
    observador.observe(elemento);
    const criada: Cena = { renderer, scene, camera, controls, conteudo, grade, texturas: new Map(), desenhar, enquadrado: false };
    cena.current = criada;
    return () => {
      observador.disconnect(); controls.removeEventListener('change', desenhar); controls.dispose();
      esvaziar(conteudo); criada.texturas.forEach((textura) => textura.dispose());
      grade.geometry.dispose(); (grade.material as THREE.Material).dispose();
      renderer.dispose(); renderer.domElement.remove(); cena.current = null;
    };
  }, []);

  useEffect(() => {
    const atual = cena.current;
    if (!atual) return;
    const escuro = document.documentElement.classList.contains('inova-dark');
    atual.scene.background = new THREE.Color(escuro ? 0x1c201e : 0xf6f5f0);
    (atual.grade.material as THREE.LineBasicMaterial).color.set(escuro ? 0x353c37 : 0xd7d4c9);
    esvaziar(atual.conteudo);
    for (const peca of documento.pieces) atual.conteudo.add(montarPeca(peca, documento.features.filter((recurso) => recurso.pieceId === peca.id), atual));
    if (!atual.enquadrado && documento.pieces.length) { enquadrar(atual); atual.enquadrado = true; }
    atual.desenhar();
  }, [documento]);

  return <div className="tec-3d" ref={recipiente} aria-label="Vista 3D do desenho" role="img">
    {!documento.pieces.length && <p className="tec-3d-vazio">Desenhe uma peça para ver em 3D.</p>}
    <button type="button" className="tec-3d-enquadrar botao-contorno" onClick={() => { if (cena.current) { enquadrar(cena.current); cena.current.desenhar(); } }}>Enquadrar</button>
  </div>;
}
