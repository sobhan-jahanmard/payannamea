import type { DataSource } from "typeorm";
import catalog from "../../lib/service-catalog.json";

// Amounts are in toman, including the per-slide rate for presentations.
export async function ensureServicePricing(dataSource: Pick<DataSource, "query">) {
  await dataSource.query(`CREATE TABLE IF NOT EXISTS service_pricing (
    order_type varchar(32) PRIMARY KEY,
    unit varchar(8) NOT NULL CHECK (
      unit = CASE WHEN order_type = 'presentation' THEN 'slide' ELSE 'page' END
    ),
    price_per_unit_toman integer NOT NULL CHECK (price_per_unit_toman > 0),
    estimate_quantity integer NOT NULL CHECK (estimate_quantity > 0)
  )`);
  // Replace the old five-service check without touching stored rates.
  const supportedTypes = catalog.map(({ order_type }) => `'${order_type}'`).join(", ");
  await dataSource.query(`ALTER TABLE service_pricing
    DROP CONSTRAINT IF EXISTS service_pricing_order_type_check,
    ADD CONSTRAINT service_pricing_order_type_check CHECK (order_type IN (${supportedTypes}))`);
  await dataSource.query(`INSERT INTO service_pricing
    (order_type, unit, price_per_unit_toman, estimate_quantity)
    SELECT order_type, unit, price_per_unit_toman, estimate_quantity
    FROM jsonb_to_recordset($1::jsonb) AS rate(
      order_type text, unit text, price_per_unit_toman integer, estimate_quantity integer
    ) ON CONFLICT (order_type) DO NOTHING`, [JSON.stringify(catalog)]);
}
