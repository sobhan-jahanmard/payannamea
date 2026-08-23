import { getCurrentUser, isStaffRole } from "../../../server/auth";
import { createCustomerOrder, listCustomerOrders, serializeOrder } from "../../../server/orders";
import { errorResponse, json } from "../../../server/http";
import { findOrCreateCustomerByPhone } from "../../../server/users";
import { z } from "zod";

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
    const payload = await request.json();
    const customer = isStaffRole(user.role)
      ? await findOrCreateCustomerByPhone(z.object({ customer_phone: z.string().min(1).max(40) }).parse(payload).customer_phone)
      : user;
    const order = await createCustomerOrder(customer, payload, isStaffRole(user.role) ? user : undefined);
    return json(serializeOrder(order, true, user.role === "customer" ? "customer" : "admin"), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
