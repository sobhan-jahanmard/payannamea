import { NextResponse } from "next/server";
import { workerApiKey } from "../../../../../../../server/config";
import { readAiReviewFile } from "../../../../../../../server/ai-reviews";
import { safeFilename } from "../../../../../../../server/files";
import { bearerWorkerAuth, errorResponse } from "../../../../../../../server/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ jobId: string; fileId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { jobId, fileId } = await context.params;
    const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
    const file = await readAiReviewFile(jobId, workerId, fileId);
    return new NextResponse(new Uint8Array(file.body), {
      headers: { "Content-Type": file.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename(file.name)}"` }
    });
  } catch (error) { return errorResponse(error); }
}
