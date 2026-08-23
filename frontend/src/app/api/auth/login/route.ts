import { z } from "zod";

import { createAccessToken, verifyPassword } from "../../../../server/auth";
import { getDataSource } from "../../../../server/db/data-source";
import { UserSchema } from "../../../../server/db/entities";
import { ApiError, errorResponse, json } from "../../../../server/http";
import { serializeUser } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(128)
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const dataSource = await getDataSource();
    const identifier = payload.username.toLowerCase();
    const user = await dataSource.getRepository(UserSchema)
      .createQueryBuilder("user")
      .where("lower(user.email) = :identifier", { identifier })
      .orWhere("lower(user.username) = :identifier", { identifier })
      .getOne();
    if (!user || (user.role !== "admin" && user.role !== "operator") || !verifyPassword(payload.password, user.password_hash)) {
      throw new ApiError(401, "Invalid username or password");
    }

    return json({
      access_token: createAccessToken(user),
      token_type: "bearer",
      user: serializeUser(user)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
