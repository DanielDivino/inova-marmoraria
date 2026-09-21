ALTER TABLE "User" ADD COLUMN "workColor" TEXT NOT NULL DEFAULT '#607453';

CREATE TABLE "QuoteWorkerAssignment" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "colorSnapshot" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "QuoteWorkerAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteWorkerAssignment_quoteId_releasedAt_idx" ON "QuoteWorkerAssignment"("quoteId", "releasedAt");
CREATE INDEX "QuoteWorkerAssignment_workerId_releasedAt_idx" ON "QuoteWorkerAssignment"("workerId", "releasedAt");

ALTER TABLE "QuoteWorkerAssignment" ADD CONSTRAINT "QuoteWorkerAssignment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteWorkerAssignment" ADD CONSTRAINT "QuoteWorkerAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
