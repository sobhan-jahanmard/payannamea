import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import { createAccessToken } from "./auth";
import type { UserEntity } from "./db/entities";
import { localReviewScoresSchema, type LocalReviewScore } from "../lib/review-scores";
import { GET as adminGet } from "../app/api/admin/orders/[orderId]/review-scores/route";
import { GET as workerGet, PUT as workerPut } from "../app/api/worker/orders/[orderId]/review-scores/route";
import { syncLocalReviewScores } from "./local-review-scores";

const sample: LocalReviewScore = {
  run_id: "20261029T100000Z-aaaaaaaaaa", report_sha256: "a".repeat(64), reviewed_at: "2026-10-29T10:00:00Z",
  status: "complete", score: 20, summary: "ارزیابی مستقل", blockers: [], matches_delivery: true,
  output_hashes: { "final/final.pdf": "b".repeat(64) },
  rubric: ["accuracy", "requirements", "reasoning", "visual", "delivery", "technical"].map((id, i) => ({
    id: id as LocalReviewScore["rubric"][number]["id"], score: [5, 4, 4, 3, 2, 2][i], reason: "شواهد بررسی شد.",
  })),
};

test("private grades enforce roles, validate scores, preserve history and reject changed runs", async () => {
  const original = globalThis.payannameDataSource;
  const oldKey = process.env.WORKER_API_KEY;
  process.env.WORKER_API_KEY = "isolated-test-worker-key";
  let rows = new Map<string, LocalReviewScore>();
  let role: UserEntity["role"] = "customer";
  let reads = 0;
  const query = async (sql: string, args: string[]) => {
    if (sql.startsWith("select id from orders")) return [{ id: args[0] }];
    if (sql.startsWith("update local_review_scores")) {
      rows = new Map([...rows].map(([id, row]) => [id, { ...row, matches_delivery: false }]));
      return [];
    }
    if (sql.startsWith("insert into local_review_scores")) { rows.set(args[1], JSON.parse(args[2])); return []; }
    reads++;
    return (args[1] ? [rows.get(args[1])].filter(Boolean) : [...rows.values()]).map(payload => ({ payload }));
  };
  const db = {
    isInitialized: true, query,
    getRepository: () => ({ findOneBy: async () => ({ id: "test-user", role }) }),
    transaction: async (run: (manager: { query: typeof query }) => Promise<void>) => {
      const snapshot = structuredClone(rows);
      try { await run({ query }); } catch (error) { rows = snapshot; throw error; }
    },
  };
  globalThis.payannameDataSource = db as unknown as DataSource;
  const context = { params: Promise.resolve({ orderId: "test-order" }) };
  try {
    assert.equal((await adminGet(new Request("http://localhost"), context)).status, 401);
    for (const deniedRole of ["customer", "operator"] as const) {
      role = deniedRole;
      const token = createAccessToken({ id: "test-user", role } as UserEntity);
      assert.equal((await adminGet(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }), context)).status, 403);
    }
    assert.equal(reads, 0, "unauthorized users must not read the grade table");
    assert.equal((await workerGet(new Request("http://localhost"), context)).status, 401);
    assert.equal((await workerPut(new Request("http://localhost", { method: "PUT", body: "{}" }), context)).status, 401);
    const headers = { Authorization: "Bearer isolated-test-worker-key" };
    const put = (value: unknown) => workerPut(new Request("http://localhost", { method: "PUT", headers, body: JSON.stringify(value) }), context);
    assert.equal((await put({ reviews: [{ ...sample, score: 21 }] })).status, 422);
    assert.equal((await put({ reviews: [{ ...sample, score: 19 }] })).status, 422);
    assert.equal((await put({ reviews: [sample, sample] })).status, 422);
    assert.equal((await put({ reviews: [sample] })).status, 200);
    assert.equal((await put({ reviews: [sample] })).status, 200);
    assert.equal(rows.size, 1, "retry must not duplicate a grade");
    const newer = { ...sample, run_id: "20261029T110000Z-bbbbbbbbbb" };
    await syncLocalReviewScores("test-order", { reviews: [newer] });
    assert.equal(rows.size, 2, "older runs must survive publication from another workspace");
    assert.equal(rows.get(sample.run_id)?.matches_delivery, false);
    await assert.rejects(syncLocalReviewScores("test-order", { reviews: [{ ...newer, summary: "changed" }] }), /different report/);
    assert.equal(rows.get(newer.run_id)?.matches_delivery, true, "failed sync must roll back current-version flags");
    role = "admin";
    const token = createAccessToken({ id: "test-user", role } as UserEntity);
    const response = await adminGet(new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } }), context);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reviews.length, 2);
    assert.equal(localReviewScoresSchema.safeParse({ reviews: [{ ...sample, status: "incomplete", score: null, rubric: [], blockers: ["PDF unavailable"] }] }).success, true);
  } finally {
    globalThis.payannameDataSource = original;
    if (oldKey === undefined) delete process.env.WORKER_API_KEY; else process.env.WORKER_API_KEY = oldKey;
  }
});
