-- DropForeignKey
ALTER TABLE "QuoteItemComponent" DROP CONSTRAINT "QuoteItemComponent_materialId_fkey";

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "legacySourceId" TEXT,
ADD COLUMN     "nextRevision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "ProductionRelease" ADD COLUMN     "commercialVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "productionReference" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commercialAccess" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "designEdit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "designRelease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "designReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobMember" (
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'VIEWER',

    CONSTRAINT "JobMember_pkey" PRIMARY KEY ("jobId","userId")
);

-- CreateTable
CREATE TABLE "CommercialDesignLink" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quoteRevisionHash" TEXT NOT NULL,
    "designRevisionId" TEXT NOT NULL,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,

    CONSTRAINT "CommercialDesignLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contentHash" TEXT,
    "storageKey" TEXT,
    "report" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialDesignLink_quoteId_checkedAt_idx" ON "CommercialDesignLink"("quoteId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExportArtifact_idempotencyKey_key" ON "ExportArtifact"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExportArtifact_revisionId_createdAt_idx" ON "ExportArtifact"("revisionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Design_legacySourceId_key" ON "Design"("legacySourceId");

-- AddForeignKey
ALTER TABLE "JobMember" ADD CONSTRAINT "JobMember_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDesignLink" ADD CONSTRAINT "CommercialDesignLink_designRevisionId_fkey" FOREIGN KEY ("designRevisionId") REFERENCES "DesignRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DesignRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItemComponent" ADD CONSTRAINT "QuoteItemComponent_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

