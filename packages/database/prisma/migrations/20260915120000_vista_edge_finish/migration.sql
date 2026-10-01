-- Catalog selector uses LINEAR_METER for edge finishes, as with Saia.
-- Vista's actual billing is SQUARE_METER at the component material price.
INSERT INTO "Service" ("id", "name", "category", "billingUnit", "currentPrice", "isActive", "updatedAt")
SELECT 'c0000000000000000000vista', 'Vista', 'Acabamentos', 'LINEAR_METER', 0, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE lower(trim("name")) = 'vista');
