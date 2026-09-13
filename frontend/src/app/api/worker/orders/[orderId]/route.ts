import { workerApiKey } from "../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../server/http";
import { getOrderOr404, serializeOrder } from "../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

// Read-only worker endpoint used by `run.py --offline --order-id <id>`.
// It deliberately does not claim, lock, update status, or create a submission.
export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    return json(serializeOrder(await getOrderOr404(orderId), true, "admin"));
  } catch (error) {
    return errorResponse(error);
  }
}
