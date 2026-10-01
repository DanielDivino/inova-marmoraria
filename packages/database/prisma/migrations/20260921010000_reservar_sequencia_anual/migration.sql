-- O contador anual legado foi marcado como janeiro na migração anterior.
-- Reserve mês 0 para ele, sem renumerar orçamentos ou consumir a sequência de janeiro.
UPDATE "QuoteSequence" AS sequencia
SET "month" = 0
WHERE "month" = 1
  AND NOT EXISTS (
    SELECT 1 FROM "Quote" WHERE "number" LIKE 'JAN-' || sequencia."year"::text || '-%'
  );
ALTER TABLE "QuoteSequence" ALTER COLUMN "month" DROP DEFAULT;
