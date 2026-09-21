INSERT INTO "Service" ("id", "name", "category", "billingUnit", "currentPrice", "isActive", "updatedAt")
SELECT 'c000000000sculptedsinksvc', 'Cuba esculpida', 'Recortes / Furações', 'UNIT'::"BillingUnit", 0, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE lower(trim("name")) = 'cuba esculpida');
