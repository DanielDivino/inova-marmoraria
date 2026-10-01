UPDATE "QuoteItemComponent" AS component
SET "calculatedTotal" = component."subtotal" + COALESCE((
  SELECT SUM(edge."subtotal")
  FROM "QuoteItemComponentEdge" AS edge
  WHERE edge."componentId" = component."id"
), 0),
"appliedTotal" = component."subtotal" + COALESCE((
  SELECT SUM(edge."subtotal")
  FROM "QuoteItemComponentEdge" AS edge
  WHERE edge."componentId" = component."id"
), 0)
WHERE component."hasManualPriceOverride" = false;
