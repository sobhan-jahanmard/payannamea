import { z } from "zod";

import { appEnvironment } from "../../../../server/config";
import { getDataSource } from "../../../../server/db/data-source";
import { UserSchema } from "../../../../server/db/entities";
import { errorResponse, json } from "../../../../server/http";
import { makeResetToken } from "../../../../server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(UserSchema);
    const user = await repo.findOneBy({ email: payload.email.trim().toLowerCase() });
    let reset_token: string | null = null;

    if (user) {
      const reset = makeResetToken();
      user.reset_token_hash = reset.tokenHash;
      user.reset_token_expires_at = reset.expiresAt;
      await repo.save(user);
      if (appEnvironment() !== "production") {
        reset_token = reset.token;
      }
    }

    return json({
      message: "If an account exists for this email, password reset instructions are ready.",
      reset_token
    });
  } catch (error) {
    return errorResponse(error);
  }
}
