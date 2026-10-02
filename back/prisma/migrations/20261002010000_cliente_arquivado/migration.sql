-- Cliente arquivado (inativo): sai das buscas do Novo orçamento; os orçamentos dele continuam.
ALTER TABLE "Customer" ADD COLUMN "archivedAt" TIMESTAMP(3);
