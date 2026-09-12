import { requireAdmin } from "../../../../../server/auth";
import { ApiError, errorResponse, json } from "../../../../../server/http";
import { deleteFinalOutputAsAdmin, deleteOrderFileAsAdmin, getOrderOr404, serializeOrder } from "../../../../../server/orders";

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

export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const outputId = searchParams.get("output_id")?.trim();
    if (outputId) {
      return json(serializeOrder(await deleteFinalOutputAsAdmin(orderId, outputId)));
    }
    const fileId = searchParams.get("file_id")?.trim();
    if (!fileId) throw new ApiError(422, "file_id is required");
    return json(serializeOrder(await deleteOrderFileAsAdmin(orderId, fileId)));
  } catch (error) {
    return errorResponse(error);
  }
}
