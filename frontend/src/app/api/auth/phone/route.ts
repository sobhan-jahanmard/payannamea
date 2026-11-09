import { z } from "zod";

import { createAccessToken } from "../../../../server/auth";
import { ApiError, errorResponse, json } from "../../../../server/http";
import { serializeUser } from "../../../../server/orders";
import { getRequestIp } from "../../../../server/phone";
import { loginWithPhone } from "../../../../server/phone-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().trim().min(1).max(40),
  password: z.string().min(1, "رمز عبور را وارد کنید").max(128),
  password_confirmation: z.string().max(128).optional(),
  purpose: z.enum(["login", "consultation"]).default("login"),
  utm_source: z.string().trim().min(1).max(100).nullable().optional()
});

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site requests are not accepted");
    }
    const payload = schema.parse(await request.json());
    const user = await loginWithPhone(payload, getRequestIp(request));
    return json({
      access_token: createAccessToken(user),
      token_type: "bearer",
      user: serializeUser(user)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
