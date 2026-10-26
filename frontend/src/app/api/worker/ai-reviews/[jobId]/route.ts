import { workerApiKey } from "../../../../../server/config";
import { completeAiReview, getAiReviewForWorker } from "../../../../../server/ai-reviews";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ jobId: string }> };
const result = z.object({
  workerId: z.string().min(1).max(255), status: z.enum(["completed", "failed"]),
  score: z.number().min(0).max(20).optional(), report: z.string().max(40_000).optional(),
  fix_prompt: z.string().max(20_000).optional(), applied_files: z.array(z.string()).max(20).optional(),
  restart_step: z.number().int().optional(), error: z.string().max(4_000).optional()
});
export async function GET(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const workerId = new URL(request.url).searchParams.get("workerId") ?? "";
    return json(await getAiReviewForWorker((await context.params).jobId, workerId));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const payload = result.parse(await request.json());
    return json(await completeAiReview((await context.params).jobId, payload.workerId, payload));
  } catch (error) { return errorResponse(error); }
}
