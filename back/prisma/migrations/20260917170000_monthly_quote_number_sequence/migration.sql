ALTER TABLE "QuoteSequence" ADD COLUMN "month" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "QuoteSequence" DROP CONSTRAINT "QuoteSequence_pkey";

ALTER TABLE "QuoteSequence" ADD CONSTRAINT "QuoteSequence_pkey" PRIMARY KEY ("year", "month");
