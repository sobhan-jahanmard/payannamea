import { workerApiKey } from "../../../../../../server/config";
import { saveUpload } from "../../../../../../server/files";
import { ApiError, bearerWorkerAuth, compact, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { submitDraft } from "../../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    const form = await request.formData();
    const workerId = form.get("worker_id");
    const notes = compact(form.get("notes"));
    if (typeof workerId !== "string" || !workerId.trim()) {
      throw new ApiError(422, "worker_id is required");
    }

    const draftFile = form.get("draft_file");
    const storedDraft = draftFile instanceof File ? await saveUpload(draftFile, `orders/${orderId}/drafts`) : undefined;
    const order = await submitDraft(orderId, workerId, notes, storedDraft);
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
