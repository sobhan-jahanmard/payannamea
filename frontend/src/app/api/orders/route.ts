import { getCurrentUser, isStaffRole } from "../../../server/auth";
import { createCustomerOrder, serializeOrder } from "../../../server/orders";
import { listOrdersPage } from "../../../server/order-list";
import { errorResponse, json } from "../../../server/http";
import { findOrCreateCustomerByPhone } from "../../../server/users";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const params = new URL(request.url).searchParams;
    const result = await listOrdersPage(user, {
      search: params.get("search") ?? undefined,
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    const audience = user.role === "customer" ? "customer" : "admin";
    return json({ ...result, orders: result.orders.map((order) => serializeOrder(order, false, audience)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
    const form = multipart ? await request.formData() : null;
    const payload = form ? JSON.parse(String(form.get("payload") || "{}")) : await request.json();
    const source = form?.get("information_source");
    const customer = isStaffRole(user.role)
      ? await findOrCreateCustomerByPhone(z.object({ customer_phone: z.string().min(1).max(40) }).parse(payload).customer_phone)
      : user;
    const order = await createCustomerOrder(customer, payload, isStaffRole(user.role) ? user : undefined, source instanceof File ? source : undefined);
    return json(serializeOrder(order, true, user.role === "customer" ? "customer" : "admin"), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
