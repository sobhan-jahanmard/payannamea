import { getCurrentUser } from "../../../server/auth";
import { createCustomerOrder, listCustomerOrders, serializeOrder } from "../../../server/orders";
import { errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const orders = await listCustomerOrders(user);
    return json(orders.map((order) => serializeOrder(order, false)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const order = await createCustomerOrder(user, await request.json());
    return json(serializeOrder(order, true, "customer"), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
