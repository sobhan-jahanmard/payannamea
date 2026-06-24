import { z } from "zod";

import { createAccessToken, hashPassword, hashResetToken } from "../../../../server/auth";
import { getDataSource } from "../../../../server/db/data-source";
import { UserSchema } from "../../../../server/db/entities";
import { ApiError, errorResponse, json } from "../../../../server/http";
import { serializeUser } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(16),
  new_password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(UserSchema);
    const user = await repo.findOneBy({ reset_token_hash: hashResetToken(payload.token) });
    if (!user?.reset_token_expires_at) {
      throw new ApiError(400, "Invalid reset token");
    }
    if (user.reset_token_expires_at.getTime() < Date.now()) {
      throw new ApiError(400, "Reset token expired");
    }

    user.password_hash = hashPassword(payload.new_password);
    user.reset_token_hash = null;
    user.reset_token_expires_at = null;
    await repo.save(user);

    return json({
      access_token: createAccessToken(user),
      token_type: "bearer",
      user: serializeUser(user)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
