import "../env";
import { getDataSource } from "../db/data-source";
import { ensureServicePricing } from "../db/service-pricing";

async function main() {
  const dataSource = await getDataSource();
  try {
    await ensureServicePricing(dataSource);
    console.log("Service pricing is ready (amounts in toman).");
  } finally {
    await dataSource.destroy();
  }
}

main().catch(() => {
  console.error("Service pricing setup failed. Check database connectivity and permissions.");
  process.exitCode = 1;
});
