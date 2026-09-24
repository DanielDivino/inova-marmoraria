type Superficie = {
  nome: string;
  contorno: string;
  textura: string;
  sombra?: number;
};

type Fogo = {
  recorte: string;
  base: number;
  inicio: number;
  fim: number;
};

type Ambiente = {
  titulo: string;
  imagem: string;
  superficies: Superficie[];
  fogo?: Fogo;
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
  {
    titulo: 'Escada em L', imagem: '/ambientes/escada-em-l.png', superficies: [
      { nome: 'Patamar', contorno: 'M472 451 H847 L959 538 H410 Z', textura: 'translate(410 451) scale(.38 .17)' },
      { nome: 'Frente do patamar', contorno: 'M410 538 H959 V608 H410 Z', textura: 'translate(410 538) scale(.38 .55)', sombra: .1 },
      { nome: 'Degrau intermediário', contorno: 'M410 608 H959 L1002 642 H387 Z', textura: 'translate(387 608) scale(.43 .12)' },
      { nome: 'Espelho intermediário', contorno: 'M387 642 H1002 V717 H387 Z', textura: 'translate(387 642) scale(.43 .55)', sombra: .1 },
      { nome: 'Degrau inferior', contorno: 'M387 717 H1002 L1045 765 H361 Z', textura: 'translate(361 717) scale(.47 .15)' },
      { nome: 'Espelho inferior', contorno: 'M361 765 H1045 V847 H361 Z', textura: 'translate(361 765) scale(.47 .55)', sombra: .1 },
      { nome: 'Primeiro degrau', contorno: 'M361 847 H1045 L1092 915 H334 Z', textura: 'translate(334 847) scale(.52 .18)' },
      { nome: 'Primeiro espelho', contorno: 'M334 915 H1092 V1004 H334 Z', textura: 'translate(334 915) scale(.52 .55)', sombra: .1 },
      { nome: 'Lateral do patamar', contorno: 'M846 450 L980 475 V620 H960 V540 Z', textura: 'translate(846 450) scale(.2 .3)', sombra: .05 },
      { nome: 'Lance superior', contorno: 'M846 400 H925 V348 H1003 V297 H1081 V242 H1126 V472 L980 475 L846 450 Z', textura: 'translate(846 242) scale(.3 .35)' },
    ],
  },
  {
    titulo: 'Painel de TV', imagem: '/ambientes/painel-tv.png', superficies: [
      { nome: 'Painel de pedra', contorno: 'M263 64 H1185 V649 H263 Z M479 272 V541 H970 V272 Z', textura: 'translate(263 64) scale(.64 .58)' },
    ],
  },
  {
    titulo: 'Nicho de banheiro', imagem: '/ambientes/nicho-banheiro.png', superficies: [
      { nome: 'Moldura e fundo do nicho', contorno: 'M414 306 H1094 V641 H414 Z M489 473 V607 H588 V473 Z', textura: 'translate(414 306) scale(.47 .42)' },
    ],
  },
  {
    titulo: 'Área gourmet', imagem: '/ambientes/area-gourmet.png', superficies: [
      { nome: 'Rodabanca esquerda', contorno: 'M151 470 H661 V573 H151 Z M243 513 V484 L247 472 L256 467 H266 L273 472 L276 484 V540 H290 V522 H297 V557 H280 V573 H261 V486 L258 479 H254 L250 486 V513 Z', textura: 'translate(151 470) scale(.36 .3)' },
      { nome: 'Laterais da churrasqueira', contorno: 'M662 360 H682 V575 H662 Z M995 360 H1015 V575 H995 Z', textura: 'translate(662 360) scale(.25 .3)', sombra: .04 },
      { nome: 'Rodabanca direita', contorno: 'M1015 470 H1315 V567 H1015 Z', textura: 'translate(1015 470) scale(.22 .3)' },
      { nome: 'Bancada', contorno: 'M135 573 H1015 V567 H1315 L1387 598 H60 Z M182 573 H343 L301 595 H129 Z', textura: 'translate(60 573) scale(.92 .1)' },
      { nome: 'Borda da bancada', contorno: 'M60 598 H1387 V642 H60 Z', textura: 'translate(60 598) scale(.92 .32)', sombra: .08 },
      { nome: 'Pé lateral', contorno: 'M60 642 H91 V842 H60 Z', textura: 'translate(60 642) scale(.08 .5)', sombra: .06 },
    ],
  },
  {
    titulo: 'Lavanderia', imagem: '/ambientes/lavanderia.png', superficies: [
      { nome: 'Rodabanca', contorno: 'M175 401 H1300 V468 H175 Z M352 401 H364 V438 H385 V412 H391 V438 H394 V458 H369 V471 H371 V476 H345 V471 H349 V420 H352 Z', textura: 'translate(175 401) scale(.78 .35)' },
      { nome: 'Bancada', contorno: 'M22 497 L100 480 H145 L175 468 H1300 L1402 511 L465 517 L495 478 L205 481 L128 520 H40 L22 510 Z', textura: 'translate(22 468) scale(.95 .15)' },
      { nome: 'Borda da bancada', contorno: 'M465 517 L1402 511 V547 H465 Z M40 520 H128 V547 H40 Z', textura: 'translate(40 511) scale(.94 .42)', sombra: .1 },
    ],
  },
  {
    titulo: 'Lareira', imagem: '/ambientes/lareira.png', superficies: [
      { nome: 'Revestimento da lareira', contorno: 'M228 209 H1224 V727 H228 Z M413 448 V713 H1030 V448 Z', textura: 'translate(228 209) scale(.69 .46)' },
      { nome: 'Base da lareira', contorno: 'M213 728 H1238 V837 H213 Z', textura: 'translate(213 728) scale(.71 .5)', sombra: .05 },
    ],
    fogo: { recorte: 'M413 448 H1030 V713 H413 Z', base: 668, inicio: 530, fim: 925 },
  },
  {
    titulo: 'Mesa de jantar', imagem: '/ambientes/mesa-jantar.png', superficies: [
      // Tampo mapeado pelos cantos (fundo, direito e esquerdo) para os veios seguirem a perspectiva.
      { nome: 'Tampo da mesa', contorno: 'M66 427 L532 355 L1409 491 L890 662 Z', textura: 'matrix(.812 .126 -.752 .111 532 359)' },
      { nome: 'Borda frontal', contorno: 'M66 428 L890 662 V706 L66 459 Z', textura: 'matrix(.569 .162 0 .5 66 428)', sombra: .1 },
      { nome: 'Borda lateral', contorno: 'M890 662 L1409 491 V527 L890 706 Z', textura: 'matrix(.358 -.115 0 .5 890 662)', sombra: .16 },
    ],
  },
];
