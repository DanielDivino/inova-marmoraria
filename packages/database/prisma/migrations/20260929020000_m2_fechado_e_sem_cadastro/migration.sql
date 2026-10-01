-- Ajustes da empresa: M² fechado ligado por padrão; só se desliga em Materiais e serviços.
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL DEFAULT 'empresa',
    "closedSquareMeter" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);
INSERT INTO "CompanySetting" ("id", "closedSquareMeter", "updatedAt") VALUES ('empresa', true, CURRENT_TIMESTAMP);

-- "Cliente rápido N" passa a se chamar "Sem cadastro N" (orçamento sem cadastro), também nos orçamentos dele.
UPDATE "Quote" AS q SET "customerNameSnapshot" = regexp_replace(q."customerNameSnapshot", '^Cliente rápido ', 'Sem cadastro ')
FROM "Customer" AS c
WHERE q."customerId" = c."id" AND c."isQuick" AND c."name" ~ '^Cliente rápido [0-9]+$' AND q."customerNameSnapshot" = c."name";
UPDATE "Customer" SET "name" = regexp_replace("name", '^Cliente rápido ', 'Sem cadastro ')
WHERE "isQuick" AND "name" ~ '^Cliente rápido [0-9]+$';
