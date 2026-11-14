import { z } from "zod";

export const channelHandle = z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/, "آیدی کانال معتبر نیست.");
const count = z.number().int().min(0).max(2147483647);

export const campaignInputSchema = z.object({
  channel_username: channelHandle.transform((value) => value.toLowerCase()),
  channel_name: z.string().trim().min(1).max(200),
  published_at: z.string().datetime({ offset: true }),
  subscribers_before: count,
  subscribers_after_24h: count.nullable(),
  subscribers_after_48h: count.nullable(),
  orders_first_24h: count.nullable(),
  orders_second_24h: count.nullable()
}).strict();

export const campaignUpdateSchema = campaignInputSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive()
});

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
