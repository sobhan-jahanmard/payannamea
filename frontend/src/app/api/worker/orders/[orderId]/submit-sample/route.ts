import { workerApiKey } from "../../../../../../server/config";
import { saveUpload } from "../../../../../../server/files";
import { ApiError, bearerWorkerAuth, compact, errorResponse, json } from "../../../../../../server/http";
import { serializeOrder } from "../../../../../../server/orders";
import { submitSamplePackage } from "../../../../../../server/worker";

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
    const pdf = form.get("sample_pdf_file");
    if (!(sample instanceof File) || !(pdf instanceof File)) throw new ApiError(422, "sample_file and sample_pdf_file are required");
    const docx = new File([sample], "sample.docx", { type: sample.type });
    const samplePdf = new File([pdf], "sample.pdf", { type: pdf.type });
    const order = await submitSamplePackage(orderId, workerId, compact(form.get("notes")), [
      { output_type: "sample", ...(await saveUpload(docx, `orders/${orderId}/samples`)) },
      { output_type: "sample_pdf", ...(await saveUpload(samplePdf, `orders/${orderId}/samples`)) }
    ]);
    return json(serializeOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
