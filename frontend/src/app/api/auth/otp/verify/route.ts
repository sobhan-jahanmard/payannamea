import { z } from "zod";

import { createAccessToken } from "../../../../../server/auth";
import { errorResponse, json } from "../../../../../server/http";
import { serializeUser } from "../../../../../server/orders";
import { getRequestIp, verifyOtp } from "../../../../../server/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().min(1).max(40),
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{4,8}$/),
  utm_source: z.string().trim().min(1).max(100).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const user = await verifyOtp(
      payload.phone,
      payload.challenge_id,
      payload.code,
      payload.utm_source,
      getRequestIp(request)
    );
    return json({
      access_token: createAccessToken(user),
      token_type: "bearer",
      user: serializeUser(user)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
