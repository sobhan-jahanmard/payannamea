import { getCurrentUser } from "../../../../../server/auth";
import { errorResponse, json } from "../../../../../server/http";
import {
  addOrderReference,
  getOrderForUserOr404,
  serializeReference
} from "../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await getCurrentUser(request);
    const { orderId } = await context.params;
    const order = await getOrderForUserOr404(orderId, user);
    const reference = await addOrderReference(order, await request.json());
    return json(serializeReference(reference), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
