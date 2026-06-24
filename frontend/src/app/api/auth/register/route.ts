import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createAccessToken, hashPassword } from "../../../../server/auth";
import { getDataSource } from "../../../../server/db/data-source";
import { UserSchema } from "../../../../server/db/entities";
import { ApiError, errorResponse, json } from "../../../../server/http";
import { serializeUser } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  full_name: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().min(7).max(40),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(UserSchema);
    const email = payload.email.trim().toLowerCase();
    const existing = await repo.findOneBy({ email });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists");
    }

    const user = await repo.save({
      id: randomUUID(),
      full_name: payload.full_name.trim(),
      email,
      phone: payload.phone.trim(),
      password_hash: hashPassword(payload.password),
      role: "customer",
      reset_token_hash: null,
      reset_token_expires_at: null
    });

    return json(
      {
        access_token: createAccessToken(user),
        token_type: "bearer",
        user: serializeUser(user)
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
