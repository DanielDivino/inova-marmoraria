-- "Concluído" e "Aguardando entrega / montagem" viram uma etapa só: "Produzido – entrega/montagem" (DONE).
UPDATE "QuoteItem" SET "workflowStatus" = 'DONE' WHERE "workflowStatus" = 'AWAITING_DELIVERY';
ALTER TYPE "ProjectWorkflowStatus" RENAME TO "ProjectWorkflowStatus_old";
CREATE TYPE "ProjectWorkflowStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'DELIVERED');
ALTER TABLE "QuoteItem" ALTER COLUMN "workflowStatus" DROP DEFAULT;
ALTER TABLE "QuoteItem" ALTER COLUMN "workflowStatus" TYPE "ProjectWorkflowStatus" USING ("workflowStatus"::text::"ProjectWorkflowStatus");
ALTER TABLE "QuoteItem" ALTER COLUMN "workflowStatus" SET DEFAULT 'TODO';
DROP TYPE "ProjectWorkflowStatus_old";
