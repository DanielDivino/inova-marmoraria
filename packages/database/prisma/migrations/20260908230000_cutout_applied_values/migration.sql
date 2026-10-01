ALTER TABLE "QuoteItemCutout"
  ADD COLUMN "calculatedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "appliedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hasManualPriceOverride" BOOLEAN NOT NULL DEFAULT false;
