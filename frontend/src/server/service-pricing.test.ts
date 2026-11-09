import "./env";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import { getDataSource } from "./db/data-source";
import { ensureServicePricing } from "./db/service-pricing";
import { getServicePricing } from "./service-pricing";

test("pricing uses stored toman rates and repeated setup preserves edits", { skip: !process.env.DATABASE_URL }, async () => {
  const dataSource = await getDataSource();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const original = globalThis.payannameDataSource;
  try {
    // All writes stay in a connection-local table and are rolled back.
    await runner.query("CREATE TEMP TABLE service_pricing (LIKE public.service_pricing INCLUDING ALL) ON COMMIT DROP");
    const localDataSource = { query: runner.query.bind(runner) };
    globalThis.payannameDataSource = { isInitialized: true, ...localDataSource } as unknown as DataSource;
    await ensureServicePricing(localDataSource);
    const rates = await getServicePricing();
    assert.equal(rates.length, 5);
    assert.deepEqual(Object.fromEntries(rates.map(rate => [rate.order_type, [
      rate.unit, rate.price_per_unit_toman, rate.estimate_quantity,
      rate.price_per_unit_toman * rate.estimate_quantity,
    ]])), {
      bachelor_thesis: ["page", 200000, 30, 6000000],
      master_thesis: ["page", 250000, 60, 15000000],
      proposal: ["page", 200000, 20, 4000000],
      research_assignment: ["page", 150000, 15, 2250000],
      presentation: ["slide", 300000, 15, 4500000],
    });
    await runner.query("UPDATE service_pricing SET price_per_unit_toman = 310000, estimate_quantity = 20 WHERE order_type = 'presentation'");
    await ensureServicePricing(localDataSource);
    const updated = (await getServicePricing()).find(rate => rate.order_type === "presentation");
    assert.equal(updated?.price_per_unit_toman, 310000);
    assert.equal(updated?.estimate_quantity, 20);
    assert.equal((await getServicePricing()).length, 5);
  } finally {
    globalThis.payannameDataSource = original;
    await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
});
