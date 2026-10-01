-- Saia permanece um acabamento de borda. Sua altura permite calcular a área
-- cobrada pelo preço snapshot do material, sem alterar bordas existentes.
ALTER TABLE "QuoteItemComponentEdge"
  ADD COLUMN "heightMm" INTEGER,
  ADD COLUMN "billingUnitSnapshot" "BillingUnit" NOT NULL DEFAULT 'LINEAR_METER';
