ALTER TABLE "Quote" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "estimatedBusinessDays" INTEGER;
ALTER TABLE "Quote" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "QuoteItem" ADD COLUMN "environment" TEXT;
CREATE INDEX "Quote_status_dueDate_idx" ON "Quote"("status", "dueDate");
