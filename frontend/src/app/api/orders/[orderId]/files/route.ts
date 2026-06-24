import { getCurrentUser } from "../../../../../server/auth";
import { saveUpload } from "../../../../../server/files";
import { ApiError, errorResponse, json } from "../../../../../server/http";
import { addOrderFile, getOrderForUserOr404, serializeOrder } from "../../../../../server/orders";

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
    const form = await request.formData();
    const fileType = form.get("file_type");
    const file = form.get("file");
    if (typeof fileType !== "string" || !(file instanceof File)) {
      throw new ApiError(422, "file_type and file are required");
    }

    const stored = await saveUpload(file, `orders/${order.id}/input`);
    const updated = await addOrderFile(order, {
      order_id: order.id,
      file_type: fileType,
      original_name: stored.original_name,
      stored_name: stored.stored_name,
      storage_path: stored.storage_path,
      content_type: stored.content_type,
      size_bytes: stored.size_bytes,
      uploaded_by: "customer"
    });
    return json(serializeOrder(updated, true, "customer"), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
