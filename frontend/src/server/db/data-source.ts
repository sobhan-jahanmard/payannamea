import "reflect-metadata";

import { DataSource } from "typeorm";

import { databaseUrl } from "../config";
import { entities } from "./entities";

declare global {
  // eslint-disable-next-line no-var
  var payannameDataSource: DataSource | undefined;
}

function makeDataSource() {
  return new DataSource({
    type: "postgres",
    url: databaseUrl(),
    ssl: { rejectUnauthorized: false },
    entities,
    synchronize: false,
    logging: false,
    poolSize: Number(process.env.DB_POOL_SIZE || 5),
    extra: {
      max: Number(process.env.DB_POOL_SIZE || 5),
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

  const dataSource = existing ?? makeDataSource();
  globalThis.payannameDataSource = dataSource;

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  return dataSource;
}
