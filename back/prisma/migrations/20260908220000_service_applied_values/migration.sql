ALTER TABLE "QuoteItemComponentEdge"
  ADD COLUMN "calculatedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "appliedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hasManualPriceOverride" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "QuoteItemService"
  ADD COLUMN "calculatedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "appliedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hasManualPriceOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "QuoteItemComponentEdge" SET "calculatedSubtotal" = "subtotal", "appliedSubtotal" = "subtotal";
UPDATE "QuoteItemService" SET "calculatedSubtotal" = "subtotal", "appliedSubtotal" = "subtotal";
