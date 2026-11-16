import { z } from "zod";

export const channelHandle = z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/, "آیدی کانال معتبر نیست.");
const count = z.number().int().min(0).max(2147483647);
const timestamp = z.string().datetime({ offset: true });

const trafficSchema = z.object({
  pageviews: count,
  visitors: count,
  sessions: count,
  orders: count
}).strict();

const observationSchema = z.object({
  baseline_start: timestamp,
  observed_at: timestamp,
  post_views: count,
  post_forwards: count,
  subscribers: count,
  joins: count,
  leaves: count,
  incoming_messages: count,
  new_chats: count,
  traffic_before: trafficSchema,
  traffic_after: trafficSchema
}).strict();

export const campaignArchiveSchema = z.object({
  post_url: z.string().trim().regex(/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{3,31}\/\d+$/, "لینک پست تلگرام معتبر نیست.").optional(),
  price_toman: count.optional(),
  notes: z.string().trim().max(4000).optional(),
  observation: observationSchema.optional()
}).strict();

const campaignFields = z.object({
  channel_username: channelHandle.transform((value) => value.toLowerCase()),
  channel_name: z.string().trim().min(1).max(200),
  published_at: timestamp,
  subscribers_before: count,
  subscribers_after_24h: count.nullable(),
  subscribers_after_48h: count.nullable(),
  orders_first_24h: count.nullable(),
  orders_second_24h: count.nullable(),
  archive: campaignArchiveSchema.optional()
});

function validObservation({ archive, published_at }: z.infer<typeof campaignFields>) {
  const observation = archive?.observation;
  if (!observation) return true;
  const published = Date.parse(published_at);
  return Date.parse(observation.baseline_start) < published && published <= Date.parse(observation.observed_at);
}

const observationError = { path: ["archive", "observation"], message: "بازهٔ ثبت آمار معتبر نیست." };

export const campaignInputSchema = campaignFields.strict().refine(validObservation, observationError);
export const campaignUpdateSchema = campaignFields.extend({
  id: z.string().uuid(),
  version: z.number().int().positive()
}).strict().refine(validObservation, observationError);

export const channelSnapshotSchema = z.array(z.object({
  username: channelHandle,
  name: z.string().min(1).max(200),
  admin_username: channelHandle,
  rank: z.number().int().positive(),
  member_count: count,
  score: z.number().min(0).max(10),
  quoted_price_toman: count.nullable(),
  plan: z.string().max(200),
  recent_views: count,
  checked_on: z.string().date(),
  replies: z.array(z.object({
    id: z.number().int().positive(),
    date: z.string().datetime({ offset: true }),
    text: z.string(),
    has_media: z.boolean()
  })),
  reply_context: z.string().nullable()
}));

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignUpdate = z.input<typeof campaignUpdateSchema>;
export type AdvertisingCampaign = CampaignInput & { id: string; version: number };
export type AdvertisingChannel = z.infer<typeof channelSnapshotSchema>[number];

export function campaignCheckpoint(publishedAt: string, hours: 24 | 48) {
  return new Date(Date.parse(publishedAt) + hours * 60 * 60 * 1000).toISOString();
}
