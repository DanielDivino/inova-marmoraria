ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "Service" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Geral';
ALTER TABLE "Quote" ADD COLUMN "customerNameSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN "customerPhoneSnapshot" TEXT;
ALTER TABLE "Quote" ADD COLUMN "workAddressSnapshot" TEXT;
