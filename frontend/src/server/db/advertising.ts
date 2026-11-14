import type { DataSource } from "typeorm";
import type { AdvertisingChannel } from "../../lib/advertising";

export async function ensureAdvertisingTables(dataSource: Pick<DataSource, "query">) {
  await dataSource.query(`CREATE TABLE IF NOT EXISTS advertising_channels (
    username varchar(32) PRIMARY KEY,
    rank integer NOT NULL CHECK (rank > 0),
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
  )`);
  await dataSource.query(`CREATE TABLE IF NOT EXISTS advertising_campaigns (
    id uuid PRIMARY KEY,
    channel_username varchar(32) NOT NULL,
    channel_name varchar(200) NOT NULL,
    published_at timestamptz NOT NULL,
    subscribers_before integer NOT NULL CHECK (subscribers_before >= 0),
    subscribers_after_24h integer CHECK (subscribers_after_24h >= 0),
    subscribers_after_48h integer CHECK (subscribers_after_48h >= 0),
    orders_first_24h integer CHECK (orders_first_24h >= 0),
    orders_second_24h integer CHECK (orders_second_24h >= 0),
    version integer NOT NULL DEFAULT 1,
    UNIQUE (channel_username, published_at)
  )`);
  await dataSource.query("ALTER TABLE advertising_channels ENABLE ROW LEVEL SECURITY");
  await dataSource.query("ALTER TABLE advertising_campaigns ENABLE ROW LEVEL SECURITY");
}

export async function seedAdvertisingChannels(dataSource: Pick<DataSource, "query">, channels: AdvertisingChannel[]) {
  for (const channel of channels) {
    await dataSource.query(
      `INSERT INTO advertising_channels (username, rank, snapshot)
       VALUES ($1,$2,$3) ON CONFLICT (username) DO NOTHING`,
      [channel.username.toLowerCase(), channel.rank, JSON.stringify(channel)]
    );
  }
}
