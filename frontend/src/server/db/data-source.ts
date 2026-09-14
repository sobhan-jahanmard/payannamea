import "reflect-metadata";

import { DataSource } from "typeorm";

import { databaseUrl } from "../config";
import { entities } from "./entities";

declare global {
  // eslint-disable-next-line no-var
  var payannameDataSource: DataSource | undefined;
  // eslint-disable-next-line no-var
  var payannameDataSourceInitialization: Promise<DataSource> | undefined;
}

function makeDataSource() {
  // The Supabase session pooler has a small per-project client limit. Each
  // Next.js server runtime keeps its own DataSource, so a conservative pool
  // prevents concurrent runtimes from exhausting that limit.
  const poolSize = Number(process.env.DB_POOL_SIZE || 1);

  return new DataSource({
    type: "postgres",
    url: databaseUrl(),
    ssl: { rejectUnauthorized: false },
    entities,
    synchronize: false,
    logging: false,
    poolSize,
    extra: {
      max: poolSize,
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 30_000)
    }
  });
}

export async function getDataSource(): Promise<DataSource> {
  const existing = globalThis.payannameDataSource;
  if (existing?.isInitialized) {
    return existing;
  }

  if (globalThis.payannameDataSourceInitialization) {
    return globalThis.payannameDataSourceInitialization;
  }

  const dataSource = existing ?? makeDataSource();
  globalThis.payannameDataSource = dataSource;
  globalThis.payannameDataSourceInitialization = dataSource.initialize()
    .then(() => dataSource)
    .finally(() => {
      globalThis.payannameDataSourceInitialization = undefined;
    });

  return globalThis.payannameDataSourceInitialization;
}
