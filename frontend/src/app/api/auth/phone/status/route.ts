import { z } from "zod";

import { ApiError, errorResponse, json } from "../../../../../server/http";
import { getPhoneAuthStatus } from "../../../../../server/phone-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().trim().min(1).max(40) });

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site requests are not accepted");
    }
    const payload = schema.parse(await request.json());
    return json(await getPhoneAuthStatus(payload.phone));
  } catch (error) {
    return errorResponse(error);
  }
}
