import { workerApiKey } from "../../../../../../server/config";
import { ApiError, bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";
import { listLocalReviewScores, syncLocalReviewScores } from "../../../../../../server/local-review-scores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    return json({ reviews: await listLocalReviewScores(orderId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 2_000_000) throw new ApiError(413, "Review scores payload is too large");
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new ApiError(422, "Invalid review scores JSON"); }
    return json(await syncLocalReviewScores(orderId, payload));
  } catch (error) {
    return errorResponse(error);
  }
}
