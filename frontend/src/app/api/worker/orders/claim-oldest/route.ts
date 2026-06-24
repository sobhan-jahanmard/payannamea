import { workerApiKey } from "../../../../../server/config";
import { bearerWorkerAuth, errorResponse, json } from "../../../../../server/http";
import { claimOldest, workerActionSchema } from "../../../../../server/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    bearerWorkerAuth(request, workerApiKey());
    const payload = workerActionSchema.pick({ workerId: true }).parse(await request.json());
    return json(await claimOldest(payload.workerId));
  } catch (error) {
    return errorResponse(error);
  }
}
