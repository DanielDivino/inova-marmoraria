type Superficie = {
  nome: string;
  contorno: string;
  textura: string;
  sombra?: number;
};

type Ambiente = {
  titulo: string;
  imagem: string;
  superficies: Superficie[];
};

// Coordenadas das fotografias 1448 x 1086. Cada plano recebe a mesma amostra,
// com compressao de profundidade; recortes excluem loucas e metais.
export const ambientes: Ambiente[] = [
  {
    titulo: 'Cozinha', imagem: '/ambientes/cozinha.png', superficies: [
      { nome: 'Rodabanca', contorno: 'M186 274 H1255 V468 H186 Z', textura: 'translate(186 274) scale(.74 .74)' },
      { nome: 'Bancada posterior', contorno: 'M186 468 H1255 L1299 482 H146 Z', textura: 'translate(146 468) scale(.8 .06)' },
      { nome: 'Borda posterior', contorno: 'M146 482 H1299 V494 H146 Z', textura: 'translate(146 482) scale(.8 .6)', sombra: .08 },
      { nome: 'Ilha', contorno: 'M245 557 H1210 L1363 654 H91 Z', textura: 'translate(91 557) scale(.88 .25)' },
      { nome: 'Borda da ilha', contorno: 'M91 654 H1363 L1333 686 H120 Z', textura: 'translate(91 654) scale(.88 .65)', sombra: .08 },
      { nome: 'Lateral esquerda', contorno: 'M91 654 L120 686 V989 H91 Z', textura: 'translate(91 654) scale(.24 .8)', sombra: .09 },
      { nome: 'Retorno esquerdo', contorno: 'M120 686 H144 V963 L120 989 Z', textura: 'translate(120 686) scale(.12 .8)', sombra: .28 },
      { nome: 'Lateral direita', contorno: 'M1363 654 V989 H1333 V686 Z', textura: 'translate(1333 654) scale(.24 .8)', sombra: .1 },
      { nome: 'Retorno direito', contorno: 'M1310 686 H1333 V989 L1310 963 Z', textura: 'translate(1310 686) scale(.12 .8)', sombra: .22 },
    ],
  },
  {
    titulo: 'Banheiro', imagem: '/ambientes/banheiro.png', superficies: [
      { nome: 'Rodabanca', contorno: 'M190 384 H1277 V478 H190 Z M726 383 H741 V397 H726 Z M556 478 V436 Q553 414 601 414 H861 Q903 414 903 437 V478 Z', textura: 'translate(190 384) scale(.75 .75)' },
      { nome: 'Bancada', contorno: 'M190 478 H1277 L1377 545 H78 Z M556 478 C559 523 575 531 626 531 H843 C886 531 899 513 902 478 Z', textura: 'translate(78 478) scale(.9 .22)' },
      { nome: 'Saia', contorno: 'M78 545 H1377 V648 H78 Z', textura: 'translate(78 545) scale(.9 .7)', sombra: .08 },
    ],
  },
  {
    titulo: 'Escada', imagem: '/ambientes/escada.png', superficies: [
      { nome: 'Espelho 6', contorno: 'M327 221 H1119 V291 H327 Z', textura: 'translate(327 221) scale(.55 .55)', sombra: .12 },
      { nome: 'Degrau 5', contorno: 'M327 291 H1119 L1151 306 H295 Z', textura: 'translate(295 291) scale(.6 .1)' },
      { nome: 'Espelho 5', contorno: 'M295 306 H1151 V379 H295 Z', textura: 'translate(295 306) scale(.6 .6)', sombra: .12 },
      { nome: 'Degrau 4', contorno: 'M295 379 H1151 L1189 405 H255 Z', textura: 'translate(255 379) scale(.65 .12)' },
      { nome: 'Espelho 4', contorno: 'M255 405 H1189 V485 H255 Z', textura: 'translate(255 405) scale(.65 .65)', sombra: .12 },
      { nome: 'Degrau 3', contorno: 'M255 485 H1189 L1234 522 H210 Z', textura: 'translate(210 485) scale(.71 .14)' },
      { nome: 'Espelho 3', contorno: 'M210 522 H1234 V610 H210 Z', textura: 'translate(210 522) scale(.71 .71)', sombra: .12 },
      { nome: 'Degrau 2', contorno: 'M210 610 H1234 L1286 662 H155 Z', textura: 'translate(155 610) scale(.79 .16)' },
      { nome: 'Espelho 2', contorno: 'M155 662 H1286 V758 H155 Z', textura: 'translate(155 662) scale(.79 .79)', sombra: .12 },
      { nome: 'Degrau 1', contorno: 'M155 758 H1286 L1349 829 H89 Z', textura: 'translate(89 758) scale(.87 .18)' },
      { nome: 'Espelho 1', contorno: 'M89 829 H1349 V927 H89 Z', textura: 'translate(89 829) scale(.87 .87)', sombra: .12 },
    ],
  },
  {
    titulo: 'Janela / Peitoril', imagem: '/ambientes/janela-peitoril.png', superficies: [
      { nome: 'Peitoril', contorno: 'M196 504 H1253 L1393 625 L64 628 Z', textura: 'translate(64 504) scale(.92 .3)' },
      { nome: 'Borda do peitoril', contorno: 'M64 628 L1393 625 L1390 685 L67 688 Z', textura: 'translate(64 625) scale(.92 .7)', sombra: .15 },
    ],
  },
  {
    titulo: 'Porta / Soleira', imagem: '/ambientes/porta-soleira.png', superficies: [
      { nome: 'Soleira', contorno: 'M208 566 H1253 L1257 576 L1266 576 L1302 636 L1324 640 L1354 694 L1382 711 L74 708 L113 685 L133 641 L155 633 L194 579 L208 577 Z', textura: 'translate(74 566) scale(.9 .32)' },
      { nome: 'Borda da soleira', contorno: 'M74 708 L1382 711 L1379 763 L77 762 Z', textura: 'translate(74 708) scale(.9 .7)', sombra: .09 },
    ],
  },
];
