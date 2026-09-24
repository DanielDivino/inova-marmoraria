ALTER TYPE "Role" ADD VALUE 'SELLER';

ALTER TABLE "Customer" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Customer_ownerId_name_idx" ON "Customer"("ownerId", "name");

-- Preserve history; infer ownership only when all quotes have one creator.
-- Ambiguous or never quoted customers remain available to administrators.
UPDATE "Customer" c SET "ownerId" = q.owner
FROM (SELECT "customerId", MIN("createdById") AS owner FROM "Quote"
      GROUP BY "customerId" HAVING COUNT(DISTINCT "createdById") = 1) q
WHERE c.id = q."customerId";
