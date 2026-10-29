import { requireAdmin } from "../../../../../../server/auth";
import { errorResponse, json } from "../../../../../../server/http";
import { listLocalReviewScores } from "../../../../../../server/local-review-scores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    return json({ reviews: await listLocalReviewScores(orderId) });
  } catch (error) {
    return errorResponse(error);
  }
}
