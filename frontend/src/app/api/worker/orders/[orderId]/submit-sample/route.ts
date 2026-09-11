import { workerApiKey } from "../../../../../../server/config";
import { saveUpload } from "../../../../../../server/files";
import { ApiError, bearerWorkerAuth, compact, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { submitSample } from "../../../../../../server/worker";

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
    if (typeof workerId !== "string" || !workerId.trim()) {
      throw new ApiError(422, "worker_id is required");
    }
    const sample = form.get("sample_file");
    if (!(sample instanceof File)) {
      throw new ApiError(422, "sample_file is required");
    }
    const storedSample = await saveUpload(sample, `orders/${orderId}/samples`);
    const order = await submitSample(orderId, workerId, compact(form.get("notes")), storedSample);
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
