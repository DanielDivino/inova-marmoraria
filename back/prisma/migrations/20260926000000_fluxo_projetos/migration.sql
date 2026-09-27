CREATE TYPE "ProjectWorkflowStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

ALTER TABLE "QuoteItem" ADD COLUMN "workflowStatus" "ProjectWorkflowStatus" NOT NULL DEFAULT 'TODO',
ADD COLUMN "workflowPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "workflowCompletedAt" TIMESTAMP(3);

-- Projetos existentes entram em "A fazer", em posição sequencial pela ordem de criação dos orçamentos.
UPDATE "QuoteItem" i SET "workflowPosition" = ordem.posicao
FROM (SELECT item.id, ROW_NUMBER() OVER (ORDER BY q."createdAt", item.id) - 1 AS posicao
      FROM "QuoteItem" item JOIN "Quote" q ON q.id = item."quoteId") ordem
WHERE i.id = ordem.id;

CREATE INDEX "QuoteItem_workflowStatus_workflowPosition_idx" ON "QuoteItem"("workflowStatus", "workflowPosition");
