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

const uploadFields = [["docx", "docx_file"], ["pdf", "pdf_file"]] as const;

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId } = await context.params;
    const form = await request.formData();
    for (const key of form.keys()) {
      if (["worker_id", "notes", "replace_existing", "docx_file", "pdf_file"].includes(key)) continue;
      throw new ApiError(422, `Unsupported final upload field: ${key}`);
    }
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
        const canonicalName = outputType === "docx" ? "final.docx" : outputType === "pdf" ? "final.pdf" : file.name;
        const canonicalFile = canonicalName === file.name ? file : new File([file], canonicalName, { type: file.type });
        uploads.push({
          output_type: outputType,
          ...(await saveUpload(canonicalFile, `orders/${orderId}/final`))
        });
      }
    }

    const order = await submitFinal(orderId, workerId, notes, uploads, { replaceExisting });
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
