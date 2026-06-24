import { requireAdmin } from "../../../../../../server/auth";
import { errorResponse, json } from "../../../../../../server/http";
import { serializeOrder, updateOrderStatus } from "../../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    const order = await updateOrderStatus(orderId, await request.json());
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
