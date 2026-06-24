import { getCurrentUser } from "../../../../server/auth";
import { errorResponse, json } from "../../../../server/http";
import { getOrderForUserOr404, serializeOrder, updateCustomerOrder } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function GET(request: Request, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { orderId } = await context.params;
    const order = await getOrderForUserOr404(orderId, user);
    return json(serializeOrder(order, true, "customer"));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { orderId } = await context.params;
    const order = await getOrderForUserOr404(orderId, user);
    const updated = await updateCustomerOrder(order, await request.json());
    return json(serializeOrder(updated, true, "customer"));
  } catch (error) {
    return errorResponse(error);
  }
}
