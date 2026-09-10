ALTER TABLE "QuoteItemCutout"
  ADD COLUMN "serviceNameSnapshot" TEXT,
  ADD COLUMN "billingUnitSnapshot" "BillingUnit",
  ADD COLUMN "unitPriceSnapshot" DECIMAL(12,2),
  ADD COLUMN "billedQuantity" DECIMAL(12,4);
