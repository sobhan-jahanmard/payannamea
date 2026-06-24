import { requireAdmin } from "../../../../server/auth";
import { errorResponse, json } from "../../../../server/http";
import { listAdminOrders, serializeOrder } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const orders = await listAdminOrders(url.searchParams.get("status_filter"));
    return json(orders.map((order) => serializeOrder(order, false)));
  } catch (error) {
    return errorResponse(error);
  }
}
