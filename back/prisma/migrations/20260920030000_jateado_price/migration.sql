UPDATE "Service"
SET "currentPrice" = 600
WHERE lower("name") = lower('Acabamento Jateado')
  AND "currentPrice" = 100;
