-- Cartões do fluxo de trabalho: cada projeto passa a ter um ou mais cartões
-- (produção e entrega parciais). O cartão principal usa o mesmo id do projeto.
CREATE TABLE "WorkflowCard" (
    "id" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "status" "ProjectWorkflowStatus" NOT NULL DEFAULT 'TODO',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "materialMissing" BOOLEAN NOT NULL DEFAULT false,
    "pieces" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowCard_status_position_idx" ON "WorkflowCard"("status", "position");
CREATE INDEX "WorkflowCard_quoteItemId_idx" ON "WorkflowCard"("quoteItemId");
ALTER TABLE "WorkflowCard" ADD CONSTRAINT "WorkflowCard_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cada projeto existente vira o seu cartão principal, na mesma coluna e posição.
INSERT INTO "WorkflowCard" ("id", "quoteItemId", "status", "position", "completedAt", "materialMissing")
SELECT "id", "id", "workflowStatus", "workflowPosition", "workflowCompletedAt", "workflowMaterialMissing" FROM "QuoteItem";

DROP INDEX "QuoteItem_workflowStatus_workflowPosition_idx";
ALTER TABLE "QuoteItem" DROP COLUMN "workflowCompletedAt",
DROP COLUMN "workflowMaterialMissing",
DROP COLUMN "workflowPosition",
DROP COLUMN "workflowStatus";

-- Notas de entrega por projeto.
CREATE TABLE "ProjectDelivery" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectDelivery_quoteItemId_idx" ON "ProjectDelivery"("quoteItemId");
CREATE UNIQUE INDEX "ProjectDelivery_quoteId_sequence_key" ON "ProjectDelivery"("quoteId", "sequence");
ALTER TABLE "ProjectDelivery" ADD CONSTRAINT "ProjectDelivery_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDelivery" ADD CONSTRAINT "ProjectDelivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
