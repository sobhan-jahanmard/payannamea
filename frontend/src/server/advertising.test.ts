import "./env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import { GET, PATCH, POST } from "../app/api/admin/advertising/route";
import { campaignCheckpoint, channelSnapshotSchema } from "../lib/advertising";
import { createAccessToken } from "./auth";
import { ensureAdvertisingTables, seedAdvertisingChannels } from "./db/advertising";
import { getDataSource } from "./db/data-source";
import type { UserEntity } from "./db/entities";

const url = "http://localhost/api/admin/advertising";

test("advertising endpoints reject unauthenticated requests", async () => {
  for (const [method, handler] of [["GET", GET], ["POST", POST], ["PATCH", PATCH]] as const) {
    assert.equal((await handler(new Request(url, { method }))).status, 401);
  }
});

test("admin can seed channels and record distinct 24/48-hour checkpoints", { skip: !process.env.DATABASE_URL }, async () => {
  const db = await getDataSource();
  const runner = db.createQueryRunner();
  const previous = globalThis.payannameDataSource;
  try {
    await runner.connect();
    await runner.startTransaction();
    const schema = "advertising_test_" + randomUUID().replaceAll("-", "");
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    const localDb = { query: runner.query.bind(runner) };
    await ensureAdvertisingTables(localDb);
    const security = await runner.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid IN ('advertising_channels'::regclass, 'advertising_campaigns'::regclass)"
    );
    assert.deepEqual(security, [{ relrowsecurity: true }, { relrowsecurity: true }]);
    const source = new URL("../../../telegram/content/2026-11-12/advertising-ranking.json", import.meta.url);
    const channels = channelSnapshotSchema.parse(JSON.parse(await readFile(source, "utf8")));
    await seedAdvertisingChannels(localDb, channels);
    await seedAdvertisingChannels(localDb, channels);

    const admin = { id: randomUUID(), role: "admin" } as UserEntity;
    const operator = { id: randomUUID(), role: "operator" } as UserEntity;
    globalThis.payannameDataSource = {
      isInitialized: true,
      ...localDb,
      getRepository: () => ({ findOneBy: async ({ id }: { id: string }) => id === admin.id ? admin : id === operator.id ? operator : null })
    } as unknown as DataSource;
    const request = (method: string, user: UserEntity, body?: unknown) => new Request(url, {
      method,
      headers: { authorization: `Bearer ${createAccessToken(user)}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    assert.equal((await GET(request("GET", operator))).status, 403);
    assert.equal((await POST(request("POST", operator, {}))).status, 403);
    assert.equal((await PATCH(request("PATCH", operator, {}))).status, 403);
    const initial = await GET(request("GET", admin));
    assert.equal(initial.headers.get("cache-control"), "private, no-store");
    const initialBody = await initial.json();
    assert.equal(initialBody.channels.length, 10);
    assert.deepEqual(initialBody.channels[0].replies, channels[0].replies);
    assert.deepEqual(initialBody.campaigns, []);

    const input = {
      channel_username: "Daneshjo_Report",
      channel_name: "اخبار دانشجویی",
      published_at: "2026-11-12T18:00:00+03:30",
      subscribers_before: 20,
      subscribers_after_24h: null,
      subscribers_after_48h: null,
      orders_first_24h: null,
      orders_second_24h: null
    };
    assert.equal((await POST(request("POST", admin, { ...input, subscribers_before: -1 }))).status, 422);
    const create = await POST(request("POST", admin, input));
    assert.equal(create.status, 201);
    const saved = await create.json();
    assert.equal(saved.channel_username, "daneshjo_report");
    assert.equal(saved.orders_first_24h, null);
    assert.equal(campaignCheckpoint(saved.published_at, 24), "2026-11-13T14:30:00.000Z");
    assert.equal(campaignCheckpoint(saved.published_at, 48), "2026-11-14T14:30:00.000Z");
    assert.equal((await POST(request("POST", admin, input))).status, 409);

    const update = {
      ...input, id: saved.id, version: saved.version,
      subscribers_after_24h: 25, subscribers_after_48h: 23,
      orders_first_24h: 0, orders_second_24h: 3
    };
    assert.equal((await PATCH(request("PATCH", admin, update))).status, 200);
    assert.equal((await PATCH(request("PATCH", admin, update))).status, 409);
    const { campaigns } = await (await GET(request("GET", admin))).json();
    assert.deepEqual(campaigns.map((campaign: typeof saved) => [
      campaign.subscribers_before, campaign.subscribers_after_24h, campaign.subscribers_after_48h,
      campaign.orders_first_24h, campaign.orders_second_24h
    ]), [[20, 25, 23, 0, 3]]);
  } finally {
    globalThis.payannameDataSource = previous;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await db.destroy();
  }
});
