CREATE TYPE "DesignRevisionStatus" AS ENUM ('IN_REVIEW', 'APPROVED', 'RETURNED', 'RELEASED', 'SUPERSEDED');

ALTER TABLE "Quote" ADD COLUMN "jobId" TEXT;

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deliveryDeadline" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Design" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "activeDraftId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignDraft" (
  "id" TEXT NOT NULL,
  "designId" TEXT NOT NULL,
  "baseRevisionId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "document" JSONB NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DesignDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignRevision" (
  "id" TEXT NOT NULL,
  "designId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "document" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "status" "DesignRevisionStatus" NOT NULL DEFAULT 'IN_REVIEW',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RevisionDecision" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionRelease" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "designRevisionId" TEXT NOT NULL,
  "replacesReleaseId" TEXT,
  "releasedById" TEXT NOT NULL,
  "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Design_activeDraftId_key" ON "Design"("activeDraftId");
CREATE INDEX "Job_customerId_createdAt_idx" ON "Job"("customerId", "createdAt");
CREATE INDEX "Project_jobId_createdAt_idx" ON "Project"("jobId", "createdAt");
CREATE INDEX "Design_projectId_createdAt_idx" ON "Design"("projectId", "createdAt");
CREATE INDEX "DesignDraft_designId_updatedAt_idx" ON "DesignDraft"("designId", "updatedAt");
CREATE UNIQUE INDEX "DesignRevision_designId_number_key" ON "DesignRevision"("designId", "number");
CREATE INDEX "DesignRevision_designId_status_createdAt_idx" ON "DesignRevision"("designId", "status", "createdAt");
CREATE INDEX "RevisionDecision_revisionId_decidedAt_idx" ON "RevisionDecision"("revisionId", "decidedAt");
CREATE INDEX "ProductionRelease_projectId_releasedAt_idx" ON "ProductionRelease"("projectId", "releasedAt");
CREATE INDEX "ProductionRelease_designRevisionId_idx" ON "ProductionRelease"("designRevisionId");
CREATE INDEX "Quote_jobId_idx" ON "Quote"("jobId");

ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Design" ADD CONSTRAINT "Design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignDraft" ADD CONSTRAINT "DesignDraft_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignDraft" ADD CONSTRAINT "DesignDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Design" ADD CONSTRAINT "Design_activeDraftId_fkey" FOREIGN KEY ("activeDraftId") REFERENCES "DesignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesignRevision" ADD CONSTRAINT "DesignRevision_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignRevision" ADD CONSTRAINT "DesignRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevisionDecision" ADD CONSTRAINT "RevisionDecision_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DesignRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevisionDecision" ADD CONSTRAINT "RevisionDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRelease" ADD CONSTRAINT "ProductionRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionRelease" ADD CONSTRAINT "ProductionRelease_designRevisionId_fkey" FOREIGN KEY ("designRevisionId") REFERENCES "DesignRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRelease" ADD CONSTRAINT "ProductionRelease_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
