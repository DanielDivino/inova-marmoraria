ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'WAITING_MATERIAL';
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'PENDING_WORK';
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_PENDING';
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'INSTALLATION_PENDING';
ALTER TABLE "Quote"
  ADD COLUMN "deliveryDeadline" DATE,
  ADD COLUMN "installationDeadline" DATE,
  ADD COLUMN "deadlineConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deadlineNote" TEXT;
CREATE INDEX "Quote_status_executionStatus_deliveryDeadline_idx" ON "Quote"("status", "executionStatus", "deliveryDeadline");
CREATE INDEX "Quote_installationDeadline_idx" ON "Quote"("installationDeadline");
CREATE INDEX "Quote_createdById_createdAt_idx" ON "Quote"("createdById", "createdAt");
