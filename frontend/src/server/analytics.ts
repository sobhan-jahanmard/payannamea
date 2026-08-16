import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDataSource } from "./db/data-source";
import { AnalyticsEventSchema } from "./db/entities";

const propertyValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean()
]);

export const analyticsEventSchema = z.object({
  visitor_id: z.string().uuid(),
  session_id: z.string().uuid(),
  event_name: z.string().regex(/^[a-z0-9_]+$/).max(120),
  path: z.string().startsWith("/").max(500),
  properties: z.record(z.string().regex(/^[a-z0-9_]+$/).max(80), propertyValueSchema)
    .refine((properties) => Object.keys(properties).length <= 20, "Too many event properties")
    .default({})
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

export async function recordAnalyticsEvent(rawInput: unknown): Promise<void> {
  const input = analyticsEventSchema.parse(rawInput);
  const dataSource = await getDataSource();
  await dataSource.getRepository(AnalyticsEventSchema).insert({
    id: randomUUID(),
    visitor_id: input.visitor_id,
    session_id: input.session_id,
    event_name: input.event_name,
    path: input.path,
    properties: input.properties
  });
}

export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  event: z.string().trim().max(120).optional(),
  path: z.string().trim().max(500).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50)
});

type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

function buildWhere(query: AnalyticsQuery) {
  const from = query.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const to = query.to ?? new Date();
  const values: unknown[] = [from, to];
  const conditions = ["created_at >= $1", "created_at <= $2"];

  if (query.event) {
    values.push(query.event);
    conditions.push(`event_name = $${values.length}`);
  }
  if (query.path) {
    values.push(`%${query.path}%`);
    conditions.push(`path ilike $${values.length}`);
  }
  if (query.search) {
    values.push(`%${query.search}%`);
    const index = values.length;
    conditions.push(`(event_name ilike $${index} or path ilike $${index} or visitor_id ilike $${index} or session_id ilike $${index} or properties::text ilike $${index})`);
  }

  return { from, to, values, sql: conditions.join(" and ") };
}

export async function getAnalyticsDashboard(rawQuery: unknown) {
  const query = analyticsQuerySchema.parse(rawQuery);
  const dataSource = await getDataSource();
  const where = buildWhere(query);
  const offset = (query.page - 1) * query.limit;

  const [summaryRows, eventRows, pageRows, dailyRows, records, countRows] = await Promise.all([
    dataSource.query(
      `select
        count(*)::int as total_events,
        count(distinct visitor_id)::int as unique_visitors,
        count(distinct session_id)::int as sessions,
        count(*) filter (where event_name = 'page_view')::int as page_views,
        coalesce(round(avg(
          case when event_name like 'page_time_%'
            and properties->>'engaged_seconds' ~ '^[0-9]+(\\.[0-9]+)?$'
          then (properties->>'engaged_seconds')::numeric end
        ), 1), 0)::float as avg_engaged_seconds
      from analytics_events where ${where.sql}`,
      where.values
    ),
    dataSource.query(
      `select event_name, count(*)::int as count, count(distinct visitor_id)::int as visitors
       from analytics_events where ${where.sql}
       group by event_name order by count desc, event_name asc limit 30`,
      where.values
    ),
    dataSource.query(
      `select path, count(*)::int as views, count(distinct visitor_id)::int as visitors,
        count(distinct session_id)::int as sessions
       from analytics_events where ${where.sql} and event_name = 'page_view'
       group by path order by views desc, path asc limit 30`,
      where.values
    ),
    dataSource.query(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        count(*)::int as events,
        count(*) filter (where event_name = 'page_view')::int as page_views,
        count(distinct visitor_id)::int as visitors,
        count(distinct session_id)::int as sessions
       from analytics_events where ${where.sql}
       group by date_trunc('day', created_at) order by date_trunc('day', created_at) asc`,
      where.values
    ),
    dataSource.query(
      `select id, visitor_id, session_id, event_name, path, properties, created_at
       from analytics_events where ${where.sql}
       order by created_at desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      [...where.values, query.limit, offset]
    ),
    dataSource.query(
      `select count(*)::int as count from analytics_events where ${where.sql}`,
      where.values
    )
  ]);

  return {
    range: { from: where.from.toISOString(), to: where.to.toISOString() },
    summary: summaryRows[0],
    top_events: eventRows,
    top_pages: pageRows,
    daily: dailyRows,
    events: records,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: countRows[0]?.count ?? 0,
      pages: Math.max(1, Math.ceil((countRows[0]?.count ?? 0) / query.limit))
    }
  };
}
