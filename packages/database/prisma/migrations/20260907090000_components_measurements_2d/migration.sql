CREATE TYPE "CalculationMode" AS ENUM ('DIMENSIONS', 'MANUAL_M2');
CREATE TYPE "ComponentType" AS ENUM ('TOP', 'SKIRT', 'BACKSPLASH', 'SIDE_LEFT', 'SIDE_RIGHT', 'SILL', 'STEP', 'OTHER');
CREATE TYPE "ComponentOrientation" AS ENUM ('HORIZONTAL', 'VERTICAL');
CREATE TYPE "ComponentShape" AS ENUM ('RECTANGLE');
CREATE TYPE "EdgeSide" AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT', 'CUSTOM');
CREATE TYPE "CutoutType" AS ENUM ('SINK', 'COOKTOP', 'FAUCET_HOLE', 'GENERIC_HOLE', 'OTHER');

ALTER TABLE "QuoteItem" ADD COLUMN "calculationMode" "CalculationMode" NOT NULL DEFAULT 'MANUAL_M2';
ALTER TABLE "QuoteItem" ADD COLUMN "manualJustification" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "drawingSchemaVersion" INTEGER;
ALTER TABLE "QuoteItem" ADD COLUMN "drawingData" JSONB;

CREATE TABLE "QuoteItemComponent" (
  "id" TEXT NOT NULL,
  "quoteItemId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "componentType" "ComponentType" NOT NULL,
  "orientation" "ComponentOrientation" NOT NULL,
  "shape" "ComponentShape" NOT NULL DEFAULT 'RECTANGLE',
  "lengthMm" INTEGER NOT NULL,
  "widthMm" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "billableArea" DECIMAL(12,4) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItemComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteItemComponentEdge" (
  "id" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "side" "EdgeSide" NOT NULL,
  "customLabel" TEXT,
  "lengthMm" INTEGER NOT NULL,
  "serviceId" TEXT NOT NULL,
  "serviceNameSnapshot" TEXT NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "billedQuantity" DECIMAL(12,4) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItemComponentEdge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteItemCutout" (
  "id" TEXT NOT NULL,
  "quoteItemId" TEXT NOT NULL,
  "componentId" TEXT,
  "cutoutType" "CutoutType" NOT NULL,
  "label" TEXT,
  "lengthMm" INTEGER,
  "widthMm" INTEGER,
  "diameterMm" INTEGER,
  "positionX" INTEGER,
  "positionY" INTEGER,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "serviceId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteItemCutout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteItemComponent_quoteItemId_sortOrder_idx" ON "QuoteItemComponent"("quoteItemId", "sortOrder");
CREATE INDEX "QuoteItemComponentEdge_componentId_sortOrder_idx" ON "QuoteItemComponentEdge"("componentId", "sortOrder");
CREATE INDEX "QuoteItemCutout_quoteItemId_sortOrder_idx" ON "QuoteItemCutout"("quoteItemId", "sortOrder");
ALTER TABLE "QuoteItemComponent" ADD CONSTRAINT "QuoteItemComponent_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItemComponentEdge" ADD CONSTRAINT "QuoteItemComponentEdge_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "QuoteItemComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItemCutout" ADD CONSTRAINT "QuoteItemCutout_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteItemCutout" ADD CONSTRAINT "QuoteItemCutout_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "QuoteItemComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
