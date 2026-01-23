-- Swap cold_water and hot_water values in rent_records
UPDATE rent_records
SET
  cold_water = subquery.new_cold,
  hot_water = subquery.new_hot
FROM (
  SELECT id, hot_water AS new_cold, cold_water AS new_hot
  FROM rent_records
) AS subquery
WHERE rent_records.id = subquery.id;
