import "./env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import { POST } from "../app/api/analytics/events/route";
import { createAccessToken } from "./auth";
import { AnalyticsEventSchema, UserSchema, type UserEntity } from "./db/entities";

test("analytics excludes verified staff for cookie and bearer sessions", async () => {
  const original = globalThis.payannameDataSource;
  const users = ["admin", "operator", "customer"].map((role) => ({ id: randomUUID(), role } as UserEntity));
  const stored: unknown[] = [];
  globalThis.payannameDataSource = {
    isInitialized: true,
    getRepository(schema: unknown) {
      if (schema === UserSchema) {
        return { findOneBy: async ({ id }: { id: string }) => users.find((user) => user.id === id) ?? null };
      }
      assert.equal(schema, AnalyticsEventSchema);
      return { insert: async (value: unknown) => { stored.push(value); } };
    }
  } as unknown as DataSource;

  const payload = { visitor_id: randomUUID(), session_id: randomUUID(), event_name: "page_view", path: "/", properties: {} };
  const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload)
  });
  try {
    for (const user of users.slice(0, 2)) {
      const token = createAccessToken(user);
      const sessions: Record<string, string>[] = [
        { authorization: `Bearer ${token}` },
        { cookie: `payanname_auth_token=${encodeURIComponent(token)}` }
      ];
      for (const headers of sessions) {
        const response = await POST(request(headers));
        assert.equal(response.status, 202);
        assert.deepEqual(await response.json(), { accepted: false });
      }
    }
    // A role change after token issuance must use the account's current role.
    const previousRoleToken = createAccessToken({ ...users[0], role: "customer" });
    assert.deepEqual(await (await POST(request({ authorization: `Bearer ${previousRoleToken}` }))).json(), { accepted: false });
    assert.equal(stored.length, 0);

    const guest = await POST(request());
    assert.equal(guest.status, 202);
    assert.deepEqual(await guest.json(), { accepted: true });
    const customer = await POST(request({ authorization: `Bearer ${createAccessToken(users[2])}` }));
    assert.equal(customer.status, 202);
    assert.deepEqual(await customer.json(), { accepted: true });
    assert.equal(stored.length, 2);
    assert.equal((await POST(request({ "sec-fetch-site": "cross-site" }))).status, 403);
    assert.equal(stored.length, 2);
  } finally {
    globalThis.payannameDataSource = original;
  }
});
