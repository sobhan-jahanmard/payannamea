import { randomUUID } from "node:crypto";
import {
  campaignInputSchema,
  campaignUpdateSchema,
  type AdvertisingCampaign,
  type AdvertisingChannel,
  type CampaignInput
} from "../lib/advertising";
import { getDataSource } from "./db/data-source";
import { ApiError } from "./http";

export async function getAdvertisingDashboard() {
  const db = await getDataSource();
  const rows: { snapshot: AdvertisingChannel }[] = await db.query(
    "SELECT snapshot FROM advertising_channels ORDER BY rank, username"
  );
  const campaigns: AdvertisingCampaign[] = await db.query(
    "SELECT * FROM advertising_campaigns ORDER BY published_at DESC, id"
  );
  return { channels: rows.map((row) => row.snapshot), campaigns };
}

function campaignParameters(input: CampaignInput) {
  return [
    input.channel_username, input.channel_name, input.published_at,
    input.subscribers_before, input.subscribers_after_24h, input.subscribers_after_48h,
    input.orders_first_24h, input.orders_second_24h,
    input.archive ? JSON.stringify(input.archive) : null
  ];
}

export async function createAdvertisingCampaign(value: unknown): Promise<AdvertisingCampaign> {
  const input = campaignInputSchema.parse(value);
  const db = await getDataSource();
  const rows: AdvertisingCampaign[] = await db.query(
    `INSERT INTO advertising_campaigns (
      channel_username, channel_name, published_at, subscribers_before,
      subscribers_after_24h, subscribers_after_48h, orders_first_24h, orders_second_24h, archive, id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::jsonb,'{}'::jsonb),$10)
    ON CONFLICT (channel_username, published_at) DO NOTHING
    RETURNING *`,
    [...campaignParameters(input), randomUUID()]
  );
  if (!rows[0]) throw new ApiError(409, "برای این کانال در همین زمان، انتشار ثبت شده است.");
  return rows[0];
}

export async function updateAdvertisingCampaign(value: unknown): Promise<AdvertisingCampaign> {
  const input = campaignUpdateSchema.parse(value);
  const db = await getDataSource();
  try {
    const rows: AdvertisingCampaign[] = await db.query(
      `WITH changed AS (
        UPDATE advertising_campaigns SET
          channel_username = $1, channel_name = $2, published_at = $3,
          subscribers_before = $4, subscribers_after_24h = $5, subscribers_after_48h = $6,
          orders_first_24h = $7, orders_second_24h = $8,
          archive = COALESCE($9::jsonb, archive), version = version + 1
        WHERE id = $10 AND version = $11
        RETURNING *
      ) SELECT * FROM changed`,
      [...campaignParameters(input), input.id, input.version]
    );
    if (!rows[0]) throw new ApiError(409, "انتشار تغییر کرده است. فهرست را تازه کنید و دوباره تلاش کنید.");
    return rows[0];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new ApiError(409, "برای این کانال در همین زمان، انتشار ثبت شده است.");
    }
    throw error;
  }
}
