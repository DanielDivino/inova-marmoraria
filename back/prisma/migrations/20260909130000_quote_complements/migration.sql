ALTER TABLE "Quote" ADD COLUMN "parentQuoteId" TEXT;
CREATE INDEX "Quote_parentQuoteId_idx" ON "Quote"("parentQuoteId");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_parentQuoteId_fkey"
  FOREIGN KEY ("parentQuoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
