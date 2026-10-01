UPDATE "Service"
SET "currentPrice" = 400
WHERE lower("name") = lower('Acabamento Jateado')
  AND "currentPrice" = 600;
