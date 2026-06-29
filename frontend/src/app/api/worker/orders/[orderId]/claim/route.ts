import { z } from "zod";

import { workerApiKey } from "../../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../../server/http";
import { claimById, workerActionSchema } from "../../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

const claimSpecificSchema = workerActionSchema.pick({ workerId: true }).extend({
  redo: z.boolean().optional().default(false)
});

export async function POST(request: Request, context: Context) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const payload = claimSpecificSchema.parse(await request.json());
    const { orderId } = await context.params;
    return json(await claimById(payload.workerId, orderId, { redo: payload.redo }));
  } catch (error) {
    return errorResponse(error);
  }
}
