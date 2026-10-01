-- Marca de "falta de material" por projeto no fluxo de trabalho (começa desligada).
ALTER TABLE "QuoteItem" ADD COLUMN "workflowMaterialMissing" BOOLEAN NOT NULL DEFAULT false;
