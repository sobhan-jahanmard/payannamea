import { workerApiKey } from "../../../../../server/config";
import { claimAiReview } from "../../../../../server/ai-reviews";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../server/http";
import { z } from "zod";

export const runtime = "nodejs";
const body = z.object({ workerId: z.string().min(1).max(255) });
export async function POST(request: Request) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    return json(await claimAiReview(body.parse(await request.json()).workerId));
  } catch (error) { return errorResponse(error); }
}
