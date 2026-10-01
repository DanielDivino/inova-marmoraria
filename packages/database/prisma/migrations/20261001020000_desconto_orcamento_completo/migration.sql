-- Desconto negociado para o orçamento completo, guardado enquanto há projetos não aprovados (o desconto em vigor é a parte proporcional dos aprovados).
ALTER TABLE "Quote" ADD COLUMN "fullDiscountAmount" DECIMAL(12,2);
