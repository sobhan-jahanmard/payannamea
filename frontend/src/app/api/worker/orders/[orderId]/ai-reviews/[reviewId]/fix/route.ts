import { workerApiKey } from "../../../../../../../../server/config";
import { queueAiFix } from "../../../../../../../../server/ai-reviews";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../../../server/http";
import { z } from "zod";

export const runtime = "nodejs";
type Context = { params: Promise<{ orderId: string; reviewId: string }> };
const body = z.object({ prompt: z.string().min(20).max(20_000) });

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const { orderId, reviewId } = await context.params;
    const { prompt } = body.parse(await request.json());
    return json(await queueAiFix(orderId, reviewId, prompt), 202);
  } catch (error) { return errorResponse(error); }
}
