import { workerApiKey } from "../../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { failOrder, workerActionSchema } from "../../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const payload = workerActionSchema.parse(await request.json());
    const { orderId } = await context.params;
    const order = await failOrder(orderId, payload.workerId, payload.notes ?? null);
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
