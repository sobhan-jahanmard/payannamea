import { requireAdmin } from "../../../../../server/auth";
import { errorResponse, json } from "../../../../../server/http";
import { getOrderOr404, serializeOrder } from "../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function GET(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    return json(serializeOrder(await getOrderOr404(orderId)));
  } catch (error) {
    return errorResponse(error);
  }
}
