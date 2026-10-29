import type { LocalReviewScore } from "../lib/review-scores";
import { isDeepStrictEqual } from "node:util";
import { localReviewScoresSchema } from "../lib/review-scores";
import { getDataSource } from "./db/data-source";
import { ApiError } from "./http";

// Kept outside serializeOrder so customer and operator order responses cannot
// accidentally include private local review grades.
export async function listLocalReviewScores(orderId: string): Promise<LocalReviewScore[]> {
  const db = await getDataSource();
  const rows: { payload: LocalReviewScore }[] = await db.query(
    "select payload from local_review_scores where order_id = $1 order by payload->>'reviewed_at' desc, run_id desc",
    [orderId],
  );
  return rows.map(row => row.payload);
}

export async function syncLocalReviewScores(orderId: string, value: unknown) {
  const { reviews } = localReviewScoresSchema.parse(value);
  const db = await getDataSource();
  await db.transaction(async manager => {
    const order = await manager.query("select id from orders where id = $1 for update", [orderId]);
    if (!order.length) throw new ApiError(404, "Order not found");
    // Never delete older runs when a different local workspace is published.
    await manager.query(
      `update local_review_scores set payload = jsonb_set(payload, '{matches_delivery}', 'false') where order_id = $1`,
      [orderId],
    );
    for (const review of reviews) {
      const existing = await manager.query(
        "select payload from local_review_scores where order_id = $1 and run_id = $2", [orderId, review.run_id],
      );
      if (existing.length && !isDeepStrictEqual(
        { ...existing[0].payload, matches_delivery: false }, { ...review, matches_delivery: false },
      )) throw new ApiError(409, `Review ${review.run_id} already exists with a different report`);
      await manager.query(
        `insert into local_review_scores (order_id, run_id, payload) values ($1, $2, $3::jsonb)
         on conflict (order_id, run_id) do update set payload = excluded.payload`,
        [orderId, review.run_id, JSON.stringify(review)],
      );
    }
  });
  return { reviews: await listLocalReviewScores(orderId) };
}
