ALTER TABLE "QuoteItemComponent"
  ADD COLUMN "materialId" TEXT,
  ADD COLUMN "materialNameSnapshot" TEXT,
  ADD COLUMN "billingUnitSnapshot" "BillingUnit",
  ADD COLUMN "unitPriceSnapshot" DECIMAL(12,2);

UPDATE "QuoteItemComponent" AS component
SET "materialId" = item."materialId",
    "materialNameSnapshot" = item."materialNameSnapshot",
    "billingUnitSnapshot" = item."billingUnitSnapshot",
    "unitPriceSnapshot" = item."unitPriceSnapshot"
FROM "QuoteItem" AS item WHERE item.id = component."quoteItemId";

ALTER TABLE "QuoteItemComponent" ADD CONSTRAINT "QuoteItemComponent_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
