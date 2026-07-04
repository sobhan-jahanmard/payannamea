import { requireAdmin } from "../../../../../../server/auth";
import { saveUpload } from "../../../../../../server/files";
import { ApiError, errorResponse, json } from "../../../../../../server/http";
import { addPaymentNote, getOrderOr404, serializeOrder } from "../../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    const form = await request.formData();
    const noteType = form.get("note_type");
    const paymentStatus = form.get("payment_status");
    const note = form.get("note");
    const receipt = form.get("receipt");

    if (typeof noteType !== "string" || typeof paymentStatus !== "string") {
      throw new ApiError(422, "note_type and payment_status are required");
    }
    if (note !== null && typeof note !== "string") {
      throw new ApiError(422, "note must be text");
    }
    if (receipt !== null && !(receipt instanceof File)) {
      throw new ApiError(422, "receipt must be a file");
    }

    await getOrderOr404(orderId);
    const storedReceipt = receipt instanceof File ? await saveUpload(receipt, `orders/${orderId}/payments`) : undefined;
    const order = await addPaymentNote(
      orderId,
      {
        note_type: noteType,
        payment_status: paymentStatus,
        note: note ?? ""
      },
      storedReceipt
    );
    return json(serializeOrder(order), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
