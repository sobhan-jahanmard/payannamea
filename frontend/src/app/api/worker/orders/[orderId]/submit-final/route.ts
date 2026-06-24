import { workerApiKey } from "../../../../../../server/config";
import { saveUpload } from "../../../../../../server/files";
import { ApiError, bearerWorkerAuth, compact, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { submitFinal } from "../../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

const uploadFields = [
  ["deliverable_source", "deliverable_source"],
  ["pptx", "pptx_file"],
  ["docx", "docx_file"],
  ["pdf", "pdf_file"],
  ["compliance_report", "compliance_report"],
  ["reference_usage_report", "reference_usage_report"],
  ["human_review_checklist", "human_review_checklist"],
  ["final_readme", "final_readme"],
  ["image_sources", "image_sources"]
] as const;

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    const form = await request.formData();
    const workerId = form.get("worker_id");
    const notes = compact(form.get("notes"));
    const replaceExisting = form.get("replace_existing") === "true";
    if (typeof workerId !== "string" || !workerId.trim()) {
      throw new ApiError(422, "worker_id is required");
    }

    const uploads = [];
    for (const [outputType, fieldName] of uploadFields) {
      const file = form.get(fieldName);
      if (file instanceof File) {
        uploads.push({
          output_type: outputType,
          ...(await saveUpload(file, `orders/${orderId}/final`))
        });
      }
    }

    const order = await submitFinal(orderId, workerId, notes, uploads, { replaceExisting });
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
