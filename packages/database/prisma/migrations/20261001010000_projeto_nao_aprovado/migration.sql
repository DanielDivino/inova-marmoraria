-- Projeto que o cliente não aprovou (aprovação parcial do orçamento): fica no orçamento, fora do valor, do fluxo e da entrega.
ALTER TABLE "QuoteItem" ADD COLUMN "declinedAt" TIMESTAMP(3);
