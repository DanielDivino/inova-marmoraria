ALTER TABLE "Remount" DROP CONSTRAINT IF EXISTS "Remount_pixPercent_check";
ALTER TABLE "Remount" ADD CONSTRAINT "Remount_pixPercent_check" CHECK ("pixPercent" IN (5, 10, 15, 20, 25));
