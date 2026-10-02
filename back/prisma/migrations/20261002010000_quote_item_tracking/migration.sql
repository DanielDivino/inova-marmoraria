ALTER TABLE "QuoteItem"
ADD COLUMN "deliveryDeadline" DATE,
ADD COLUMN "notes" TEXT;

CREATE TABLE "QuoteItemWorkerAssignment" (
    "id" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "colorSnapshot" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "QuoteItemWorkerAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteItemWorkerAssignment_quoteItemId_releasedAt_idx"
ON "QuoteItemWorkerAssignment"("quoteItemId", "releasedAt");
CREATE INDEX "QuoteItemWorkerAssignment_workerId_releasedAt_idx"
ON "QuoteItemWorkerAssignment"("workerId", "releasedAt");

ALTER TABLE "QuoteItemWorkerAssignment"
ADD CONSTRAINT "QuoteItemWorkerAssignment_quoteItemId_fkey"
FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItemWorkerAssignment"
ADD CONSTRAINT "QuoteItemWorkerAssignment_workerId_fkey"
FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing quote-level assignments as the initial project assignment.
INSERT INTO "QuoteItemWorkerAssignment" ("id", "quoteItemId", "workerId", "colorSnapshot", "assignedAt")
SELECT 'c' || md5(item."id" || assignment."id"), item."id", assignment."workerId", assignment."colorSnapshot", assignment."assignedAt"
FROM "QuoteItem" item
JOIN (
  SELECT DISTINCT ON ("quoteId") "quoteId", "id", "workerId", "colorSnapshot", "assignedAt"
  FROM "QuoteWorkerAssignment"
  WHERE "releasedAt" IS NULL
  ORDER BY "quoteId", "assignedAt" DESC, "id" DESC
) assignment ON assignment."quoteId" = item."quoteId";
