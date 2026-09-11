import { workerApiKey } from "../../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { recordWorkerRun } from "../../../../../../server/worker";

export const runtime = "nodejs";
interface Context { params: Promise<{ orderId: string }>; }
export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    return json(serializeOrder(await recordWorkerRun(orderId, await request.json())));
  } catch (error) { return errorResponse(error); }
}
