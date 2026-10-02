-- Famílias das pedras e bordas/acabamentos de superfície no catálogo (Materiais e serviços), com as
-- informações do mostruário. Os materiais ganham a família (a categoria passa a ser o nome dela) e os
-- serviços de acabamento já cadastrados passam a apontar para a borda ou o acabamento que cobram.

-- CreateEnum
CREATE TYPE "FinishKind" AS ENUM ('EDGE', 'SURFACE');

-- CreateTable
CREATE TABLE "MaterialFamily" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plural" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "care" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scratchResistance" INTEGER,
    "stainResistance" INTEGER,
    "heatResistance" INTEGER,
    "aesthetics" INTEGER,
    "maintenance" TEXT,
    "costLevel" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finish" (
    "id" TEXT NOT NULL,
    "kind" "FinishKind" NOT NULL,
    "name" TEXT NOT NULL,
    "appearance" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uses" TEXT NOT NULL,
    "perceivedValue" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finish_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Material" ADD COLUMN "familyId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "finishId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MaterialFamily_name_key" ON "MaterialFamily"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Finish_name_key" ON "Finish"("name");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "MaterialFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_finishId_fkey" FOREIGN KEY ("finishId") REFERENCES "Finish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Famílias com as informações do mostruário
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliagranito', 'Granito', 'Granitos', 'Rocha natural dura, de grãos visíveis e enorme variedade de cores. Aguenta bem o uso diário; a absorção muda de chapa para chapa.', 'Rústico, contemporâneo, industrial', ARRAY['Alta resistência a riscos e ao calor', 'Durabilidade excepcional', 'Vai bem da cozinha à área externa']::TEXT[], ARRAY['Avaliar a selagem conforme a chapa', 'Pano úmido e detergente neutro', 'Longe de ácidos e abrasivos']::TEXT[], ARRAY['cozinha', 'banheiro', 'gourmet', 'lavanderia', 'piso']::TEXT[], 5, 4, 5, 3, 'Baixa', 2, 0, CURRENT_TIMESTAMP);
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliamarmore', 'Mármore', 'Mármores', 'Pedra nobre de veios elegantes, cada chapa única. Ácidos como limão e vinagre fosqueiam a superfície, e ela risca com mais facilidade.', 'Clássico, luxuoso, minimalista', ARRAY['Beleza que não se repete', 'Valoriza qualquer ambiente', 'Toque frio e agradável']::TEXT[], ARRAY['Muito sensível a limão e vinagre', 'Pede impermeabilização', 'Só produtos de pH neutro']::TEXT[], ARRAY['banheiro', 'painel']::TEXT[], 3, 2, 3, 5, 'Alta', 3, 1, CURRENT_TIMESTAMP);
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliaquartzito', 'Quartzito', 'Quartzitos', 'Rocha natural rica em quartzo e muito dura: a aparência do mármore com mais resistência no dia a dia.', 'Sofisticado, natural, elegante', ARRAY['Bem mais duro que o mármore', 'Veios naturais marcantes', 'Resiste a riscos e ao calor']::TEXT[], ARRAY['Impermeabilizar periodicamente', 'Pode absorver óleo: limpar logo', 'Conferir a procedência do lote']::TEXT[], ARRAY['cozinha', 'banheiro', 'gourmet', 'painel']::TEXT[], 5, 3, 4, 5, 'Média', 4, 2, CURRENT_TIMESTAMP);
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliaultracompacto', 'Ultracompacto', 'Ultracompactos', 'Superfície industrial de altíssima densidade, prensada a altas temperaturas e quase sem poros. Calor, sol e área externa dependem do fabricante e do modelo.', 'Tecnológico, premium, contemporâneo', ARRAY['Alta resistência a manchas e ao calor', 'Dispensa impermeabilização', 'Placas grandes e padrão uniforme']::TEXT[], ARRAY['Bordas e recortes lascam com impacto', 'Instalação por equipe especializada', 'Reparo difícil em caso de dano']::TEXT[], ARRAY['cozinha', 'banheiro', 'gourmet', 'painel']::TEXT[], 5, 5, 5, 4, 'Muito baixa', 4, 3, CURRENT_TIMESTAMP);
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliaindustrializado', 'Industrializado', 'Industrializados', 'Superfície composta (quartzo, aglomerado de mármore ou vidro cristalizado, conforme o produto). Visual uniforme; o comportamento varia de um produto para outro.', 'Moderno, clean, uniforme', ARRAY['Cor e padrão uniformes', 'Baixa absorção no quartzo e no vidro', 'Ótimo para bancadas internas']::TEXT[], ARRAY['Panela quente nunca direto na pedra', 'Evitar sol direto prolongado', 'Limpeza só com produto neutro']::TEXT[], ARRAY['banheiro', 'painel']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, 4, CURRENT_TIMESTAMP);
INSERT INTO "MaterialFamily" ("id", "name", "plural", "summary", "style", "advantages", "care", "uses", "scratchResistance", "stainResistance", "heatResistance", "aesthetics", "maintenance", "costLevel", "sortOrder", "updatedAt") VALUES ('cfamiliasuperficieespecial', 'Superfície especial', 'Especiais', 'Superfície de nome comercial, escolhida pelo visual marcante. A família (natural ou industrializada) vem da ficha do fornecedor.', 'Exclusivo, marcante, autoral', ARRAY['Visual exclusivo e marcante', 'Destaque em projetos autorais']::TEXT[], ARRAY['Mostrar a chapa real ao cliente', 'Seguir o manual de uso do fornecedor']::TEXT[], ARRAY['painel']::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, 5, CURRENT_TIMESTAMP);

-- Família de cada material (pela categoria e pelo nome); Preto Absoluto e Calacatta Gold são ultracompactos.
WITH texto AS (SELECT m."id", translate(lower(m."name"), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS n, translate(lower(m."category"), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS c FROM "Material" m),
escolha AS (
  SELECT "id", CASE
    WHEN n || ' ' || c LIKE '%ultracompacto%' OR n IN ('preto absoluto', 'calacatta gold') THEN 'Ultracompacto'
    WHEN n || ' ' || c LIKE '%quartzito%' OR n LIKE '%taj mahal%' THEN 'Quartzito'
    WHEN n || ' ' || c LIKE '%marmore%' THEN 'Mármore'
    WHEN c LIKE '%granit%' THEN 'Granito'
    WHEN c ~ '(industrializ|importad|quartzo|silestone)' OR n ~ '(prime|nano|translucido|silestone|quartzo)' THEN 'Industrializado'
    WHEN n ~ '(granit|sao gabriel|ubatuba)' THEN 'Granito'
    ELSE 'Superfície especial' END AS familia
  FROM texto
)
UPDATE "Material" m SET "familyId" = f."id", "category" = f."name"
FROM escolha e JOIN "MaterialFamily" f ON f."name" = e.familia
WHERE m."id" = e."id";

-- Bordas e acabamentos de superfície do mostruário
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordareta', 'EDGE', 'Reta', 'reta', 'Corte a 90°, sem recuo nem arredondamento. Limpa, leve e a mais econômica.', 'Uso geral, peças simples e obras com prazo curto', 'Baixo', 0, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordaboleada', 'EDGE', 'Boleada', 'boleada', 'Quina arredondada: toque suave e mais segurança no dia a dia.', 'Banheiro e lavatório', 'Médio', 1, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordameiacana', 'EDGE', 'Meia-cana', 'meia-cana', 'Frente toda arredondada, em meio círculo: macia ao toque e de visual clássico.', 'Lavatório, mesa e balcão', 'Médio', 2, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordachanfrada', 'EDGE', 'Chanfrada', 'chanfrada', 'Pequeno corte a 45° na quina, que deixa a peça mais leve e elegante.', 'Banheiro, soleira e peitoril', 'Médio', 3, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordabisote', 'EDGE', 'Bisotê', 'bisote', 'Bisel mais largo que o chanfro, inclinado para valorizar a espessura.', 'Lavatório, soleira e peitoril', 'Médio', 4, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordameiaesquadria', 'EDGE', 'Meia-esquadria', 'meia-esquadria', 'Duas peças unidas a 45°: a pedra parece maciça, sem emenda à vista.', 'Cozinha, ilha e balcão', 'Alto', 5, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordasaia', 'EDGE', 'Saia', 'saia', 'Faixa vertical na frente da bancada, que dá corpo e presença à peça.', 'Bancada, ilha e balcão', 'Alto', 6, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordaengrossada', 'EDGE', 'Engrossada', 'engrossada', 'Frente com espessura dobrada: robustez e imponência no acabamento.', 'Cozinha, ilha e balcão comercial', 'Alto', 7, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordapingadeira', 'EDGE', 'Pingadeira', 'pingadeira', 'Rebaixo sob a borda que corta o escorrimento da água e protege a parede.', 'Soleira, peitoril e área externa', 'Técnico', 8, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentobordapolida', 'EDGE', 'Polida', 'polida', 'Brilho em toda a borda, realçando as cores e os veios da pedra.', 'Qualquer perfil que fique à vista', 'Médio', 9, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentosuperficiepolido', 'SURFACE', 'Polido', 'polido', 'Brilho intenso que realça cores e veios.', 'Bancadas, painéis e interiores clássicos', NULL, 10, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentosuperficielevigado', 'SURFACE', 'Levigado', 'levigado', 'Fosco suave e liso ao toque. Discreto e muito sofisticado.', 'Bancadas e pisos internos contemporâneos', NULL, 11, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentosuperficieescovado', 'SURFACE', 'Escovado', 'escovado', 'Textura suave ao toque, que escorrega menos.', 'Áreas molhadas', NULL, 12, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentosuperficieflameado', 'SURFACE', 'Flameado', 'flameado', 'Superfície rústica e antiderrapante, feita em granito.', 'Áreas externas, piscinas e escadas', NULL, 13, CURRENT_TIMESTAMP);
INSERT INTO "Finish" ("id", "kind", "name", "appearance", "description", "uses", "perceivedValue", "sortOrder", "updatedAt") VALUES ('cacabamentosuperficiejateado', 'SURFACE', 'Jateado', 'jateado', 'Fosco uniforme e moderno.', 'Pisos e projetos de linhas retas', NULL, 14, CURRENT_TIMESTAMP);

-- Serviços já cadastrados que cobram cada borda ou acabamento
UPDATE "Service" SET "finishId" = 'cacabamentobordareta' WHERE lower("name") IN ('acabamento simples');
UPDATE "Service" SET "finishId" = 'cacabamentobordaboleada' WHERE lower("name") IN ('acabamento boleado');
UPDATE "Service" SET "finishId" = 'cacabamentobordameiacana' WHERE lower("name") IN ('acabamento meia cana');
UPDATE "Service" SET "finishId" = 'cacabamentobordachanfrada' WHERE lower("name") IN ('acabamento chanfrado');
UPDATE "Service" SET "finishId" = 'cacabamentobordameiaesquadria' WHERE lower("name") IN ('acabamento 45°', 'acabamento 45° — granito/mármore', 'acabamento 45° — importado');
UPDATE "Service" SET "finishId" = 'cacabamentobordasaia' WHERE lower("name") IN ('saia');
UPDATE "Service" SET "finishId" = 'cacabamentobordaengrossada' WHERE lower("name") IN ('acabamento duplo');
UPDATE "Service" SET "finishId" = 'cacabamentobordapolida' WHERE lower("name") IN ('acabamento com brilho');
UPDATE "Service" SET "finishId" = 'cacabamentosuperficiepolido' WHERE lower("name") IN ('acabamento polimento');
UPDATE "Service" SET "finishId" = 'cacabamentosuperficiejateado' WHERE lower("name") IN ('acabamento jateado');
