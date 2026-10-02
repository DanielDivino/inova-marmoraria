# Fotografias do visualizador

As fotos ficam em WebP (1448 × 1086, qualidade 82), convertidas das PNG originais geradas abaixo:
cada uma tem 60 a 150 KB em vez de 2 MB.

Geradas com a ferramenta integrada image_gen, sem API/CLI externa.
Arquivos originais: cozinha.png, banheiro.png, escada.png, janela-peitoril.png e porta-soleira.png.
Novos arquivos: escada-em-l.png, painel-tv.png, nicho-banheiro.png,
area-gourmet.png, lavanderia.png, lareira.png e mesa-jantar.png.
Resolucao: 1448 x 1086. Cenas ilustrativas, nao fotografias de obras da empresa.

Os contornos e planos ficam em front/componentes/mostruario/cenas.ts. Ao substituir uma
foto, atualizar seus contornos; nao reutilizar mascaras em outra fotografia.
A mesma amostra do catalogo preenche todos os planos, preservando sombras da
foto em escala de cinza. A perspectiva e a escala dos veios sao aproximadas.
Piso, madeira, paredes, esquadrias, cuba e metais ficam fora dos recortes.

## Novas cenas (image_gen)

Todas usam o mesmo prompt-base das cinco cenas originais: fotografia arquitetônica
realista 4:3, 1448 × 1086, casa contemporânea brasileira, luz natural, pedra
cinza-clara uniforme com planos nítidos para troca de textura, sem pessoas,
marca d'água ou texto. Detalhes pedidos por cena:

- **escada-em-l**: escada de pedra em L com patamar, degraus e espelhos visíveis,
  madeira no piso e paredes brancas, sem pedras adicionais.
- **painel-tv**: painel plano de pedra atrás de TV preta, móvel baixo de madeira,
  enquadramento frontal e contorno simples para excluir a TV.
- **nicho-banheiro**: nicho retangular de pedra embutido no box para sabonetes,
  parede de revestimento branco e poucos frascos na prateleira.
- **area-gourmet**: bancada de pedra com rodabanca e churrasqueira, armários
  de madeira, metais e cuba distintos da pedra.
- **lavanderia**: bancada de pedra para tanque e máquina, rodabanca, armários
  de madeira e cuba branca.
- **lareira**: revestimento de pedra ao redor da abertura preta da lareira,
  base de pedra e mobiliário neutro.
- **mesa-jantar**: grande tampo de pedra retangular, estrutura metálica escura,
  cadeiras de madeira e vista levemente elevada para mostrar topo e borda.

## Ajustes de contorno (24/09/2026)

- **escada-em-l**: o lance superior agora segue os degraus reais (antes pintava a
  parede); incluída a lateral do patamar.
- **area-gourmet**: rodabanca recortada em volta da torneira, bancada contínua
  com furo da cuba, laterais de pedra da churrasqueira e pé lateral esquerdo.
- **lavanderia**: rodabanca contínua com recorte da torneira; bancada contornando
  a cuba de apoio.
- **lareira**: fogo aceso animado em SVG (campo `fogo` da cena), sem alterar a foto;
  respeita `prefers-reduced-motion`.
- **mesa-jantar**: contornos pelos quatro cantos reais do tampo e textura com
  `matrix(...)` para os veios seguirem a perspectiva.

## Cena pendente: cozinha com área seca e molhada

Arquivo esperado: `cozinha-seca-molhada.png` (1448 × 1086). Prompt sugerido, no
mesmo padrão das demais:

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Kitchen seen from eye level, slightly elevated, centered front view. One long straight countertop on oak lower cabinets with a matching short rectangular stone backsplash, divided into two zones: LEFT "wet area" with one rectangular undermount stainless steel sink and a single brushed nickel faucet, RIGHT "dry area" with a flush black glass induction cooktop with four burners set into the stone and clear empty counter between sink and cooktop. Sink and cooktop clearly distinct from the stone, faucet slender and not covering the backsplash. 4cm stone front edge visible along the whole length. White plaster wall above backsplash, no upper cabinets, no range hood covering the backsplash, no objects on the counter.

## Prompts utilizados

### cozinha

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Kitchen from eye level slightly elevated, centered front view with full back wall and freestanding island foreground. A single rectangular uninterrupted light gray stone backsplash panel on back wall, back countertop same stone on oak lower cabinets, no upper cabinets. Faucet and sink are NOT on the stone: no sink or hob visible in this composition, appliances integrated into wood cabinets. Large island with clearly visible wide flat stone top and 4cm thick stone front and side edges, oak base (NOT stone waterfall legs). Island does not obscure rear countertop. No objects on any counter, no plants occluding surfaces. White plaster wall above backsplash, warm oak cabinet faces, stainless oven in back cabinets. Crop so stone planes occupy much of photo with whole island visible.

### banheiro

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Bathroom vanity catalog photograph. Nearly frontal slightly elevated view of one floating oak vanity with broad light gray stone countertop, substantial rectangular stone apron front and right edge, and matching short rectangular backsplash. White ceramic vessel basin on top centered, brushed nickel faucet wall mounted above basin. Mirror ABOVE backsplash, not reflecting stone or duplicate vanity. Stone counter left and right of basin clearly visible and unobstructed. Basin rim and white ceramic are not stone. White painted walls, oak flooring, no tiles or niches or other stone elements. Whole vanity with generous clear counter space in center of image, no decor on countertop.

### escada

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Staircase catalog photograph, centered straight-on slightly elevated architectural shot. Exactly SIX wide rectangular stone steps leading to a wood upper landing, full width of every tread and riser visible, treads and risers all uniform light gray stone. Simple symmetric straight staircase, NO curved steps or extra stairs visible beyond landing. White plaster walls flank steps, slender black handrail attached to side wall not crossing steps. Oak floor foreground and oak upper landing, NO stone skirting or stone wall cladding. Steps fill central 80 percent of frame width, daylight from side, broad tread surfaces well lit with realistic slight shade on risers, crisp planar geometry.

### janela-peitoril

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Window sill catalog photograph close-up from slightly elevated frontal angle. Large white aluminum framed window in white plaster wall with simple blurred green garden beyond glass. A DEEP wide single light gray stone interior windowsill, its broad flat top occupying lower third of photo and crisp 3cm front edge clearly visible, side edges too. Window lower rail sits BEHIND the stone top. White plaster vertical reveals, no stone surround. Bare sill, no decor, no curtains, no objects. Show whole width of sill with generous margin both sides. Emphasize real installation and appreciable depth of stone top. Bright natural light.

### porta-soleira

Use case: product-mockup. Asset: realistic architectural photograph for stone showroom interactive material visualizer. Generate one single landscape 4:3 photograph, high resolution, crisp straight architectural edges, professional commercial photography, bright natural daylight, understated premium contemporary Brazilian home. All designated stone is UNIFORM light neutral gray honed limestone with almost no veins, so another texture can be composited onto it. Stone surfaces must be fully visible with simple straight boundaries, no objects obscuring them, no text, no watermarks, no collage. Non-stone surfaces clearly different: pale painted plaster, natural oak furniture and wood floor, no stone floor. Balanced realistic exposure, no fog, no depth blur, no extravagant decor. Door threshold catalog photograph, low close-up looking slightly downward at open oak entrance door and its stone threshold. Bottom half of doorway dominates image; doorway white painted jambs, door leaf opened away into room and not hiding threshold. Broad rectangular single light gray stone threshold, 25cm deep, occupying middle lower portion of image, top and thin front bevel clearly visible from above, full width uncropped. Oak wood flooring inside and matte terracotta tile outside, distinctly NOT stone. All stone limited to this one rectangular threshold strip between floors. White plaster walls, natural bright daylight, no doormat, no clutter, no feet or people. The threshold is the unmistakable main subject.
