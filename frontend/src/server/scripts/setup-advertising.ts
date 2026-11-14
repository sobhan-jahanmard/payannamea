import "../env";
import { readFile } from "node:fs/promises";
import { channelSnapshotSchema } from "../../lib/advertising";
import { ensureAdvertisingTables, seedAdvertisingChannels } from "../db/advertising";
import { getDataSource } from "../db/data-source";

async function main() {
  const source = new URL("../../../../telegram/content/2026-11-12/advertising-ranking.json", import.meta.url);
  const channels = channelSnapshotSchema.parse(JSON.parse(await readFile(source, "utf8")));
  const db = await getDataSource();
  try {
    await db.transaction(async (manager) => {
      await ensureAdvertisingTables(manager);
      await seedAdvertisingChannels(manager, channels);
    });
    console.log(`Advertising tables are ready. Shortlist contains ${channels.length} source channels.`);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Advertising setup failed.");
  process.exitCode = 1;
});
