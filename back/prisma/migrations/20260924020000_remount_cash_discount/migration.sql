ALTER TABLE "Remount" ADD COLUMN "cashDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("cashDiscount" >= 0);
