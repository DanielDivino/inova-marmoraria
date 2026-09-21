UPDATE "Service"
SET "category" = 'Recortes / Furações',
    "billingUnit" = 'UNIT'::"BillingUnit",
    "isActive" = true
WHERE lower(trim("name")) IN ('furo de torneira', 'furação de torneira');

INSERT INTO "Service" ("id", "name", "category", "billingUnit", "currentPrice", "isActive", "updatedAt")
SELECT 'c000000000faucetholesvc', 'Furo de Torneira', 'Recortes / Furações', 'UNIT'::"BillingUnit", 70, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE lower(trim("name")) IN ('furo de torneira', 'furação de torneira'));
