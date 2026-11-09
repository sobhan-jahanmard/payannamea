import type { DataSource } from "typeorm";

// Amounts are in toman, including the per-slide rate for presentations.
export async function ensureServicePricing(dataSource: Pick<DataSource, "query">) {
  await dataSource.query(`CREATE TABLE IF NOT EXISTS service_pricing (
    order_type varchar(32) PRIMARY KEY CHECK (order_type IN (
      'bachelor_thesis', 'master_thesis', 'proposal', 'research_assignment', 'presentation'
    )),
    unit varchar(8) NOT NULL CHECK (
      unit = CASE WHEN order_type = 'presentation' THEN 'slide' ELSE 'page' END
    ),
    price_per_unit_toman integer NOT NULL CHECK (price_per_unit_toman > 0),
    estimate_quantity integer NOT NULL CHECK (estimate_quantity > 0)
  )`);
  await dataSource.query(`INSERT INTO service_pricing
    (order_type, unit, price_per_unit_toman, estimate_quantity) VALUES
    ('bachelor_thesis', 'page', 200000, 30),
    ('master_thesis', 'page', 250000, 60),
    ('proposal', 'page', 200000, 20),
    ('research_assignment', 'page', 150000, 15),
    ('presentation', 'slide', 300000, 15)
    ON CONFLICT (order_type) DO NOTHING`);
}
