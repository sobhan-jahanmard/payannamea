import { z } from "zod";

import { errorResponse, json } from "../../../../../server/http";
import { requestOtp } from "../../../../../server/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().min(1).max(40) });

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    return json(await requestOtp(payload.phone));
  } catch (error) {
    return errorResponse(error);
  }
}
