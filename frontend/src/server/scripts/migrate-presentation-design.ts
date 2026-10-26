/** Additive and repeatable: no order content, status or files are changed. */
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { getDataSource } from "../db/data-source";

async function main() {
  if (existsSync(".env.local")) for (const [key, value] of Object.entries(parseEnv(readFileSync(".env.local", "utf8")))) process.env[key] ??= value;
  const db = await getDataSource();
  try {
    await db.transaction(async manager => {
      await manager.query("alter table orders add column if not exists presentation_style varchar(64)");
      await manager.query("alter table orders add column if not exists presentation_font varchar(100)");
    });
    console.log("Presentation style/font columns are ready. No orders were run.");
  } finally { await db.destroy(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
