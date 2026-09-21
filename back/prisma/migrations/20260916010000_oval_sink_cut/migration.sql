-- Copy the current regular sink-cut price without changing existing services.
INSERT INTO "Service" ("id", "name", "category", "billingUnit", "currentPrice", "isActive", "updatedAt")
SELECT 'c000000000000000ovalcut', 'Corte de cuba oval', 'Recortes / Furações',
  COALESCE((SELECT "billingUnit" FROM "Service" WHERE lower(trim("name")) = 'recorte de cuba' ORDER BY "isActive" DESC, "createdAt" LIMIT 1), 'UNIT'::"BillingUnit"),
  COALESCE((SELECT "currentPrice" FROM "Service" WHERE lower(trim("name")) = 'recorte de cuba' ORDER BY "isActive" DESC, "createdAt" LIMIT 1), 180),
  true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE lower(trim("name")) = 'corte de cuba oval');
