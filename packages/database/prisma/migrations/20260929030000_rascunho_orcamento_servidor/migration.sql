-- Rascunho do Novo orçamento no servidor (um por usuário), igual no celular e no computador.
CREATE TABLE "QuoteEditorDraft" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteEditorDraft_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "QuoteEditorDraft" ADD CONSTRAINT "QuoteEditorDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
