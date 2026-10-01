ALTER TABLE "QuoteItemComponent"
  ADD COLUMN "calculatedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "appliedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hasManualPriceOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "QuoteItemComponent" AS component
SET "calculatedTotal" = component."subtotal",
    "appliedTotal" = component."subtotal";
