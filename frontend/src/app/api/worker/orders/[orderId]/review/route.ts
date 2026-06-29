import { workerApiKey } from "../../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";
import { getReviewedOrderForWorker } from "../../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    return json(await getReviewedOrderForWorker(orderId));
  } catch (error) {
    return errorResponse(error);
  }
}
