import "../env";

import { getDataSource } from "../db/data-source";
import { ensureOrderListIndexes } from "../db/order-list-indexes";

async function main() {
  const dataSource = await getDataSource();
  try {
    await ensureOrderListIndexes(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
