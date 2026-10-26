import { workerApiKey } from "../../../../../../server/config";
import { listAiReviews, queueAiReview } from "../../../../../../server/ai-reviews";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    return json(await listAiReviews((await context.params).orderId));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    return json(await queueAiReview((await context.params).orderId), 202);
  } catch (error) { return errorResponse(error); }
}
