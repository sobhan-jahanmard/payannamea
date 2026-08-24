import { z } from "zod";

import { getDataSource } from "./db/data-source";
import { UserSchema } from "./db/entities";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./otp";
import { serializeAdminUser, updateAdminUser } from "./users";

export const phoneFollowupQuerySchema = z.object({
  phone: z.string().trim().min(1).max(40)
});

const status = z.enum(["new", "contacted", "closed"]);
export const phoneFollowupUpdateSchema = z.object({
    id: z.string().uuid(),
    admin_followup_status: status.optional(),
    admin_note: z.string().trim().max(2_000).optional()
  }).refine((input) => input.admin_followup_status !== undefined || input.admin_note !== undefined, {
    message: "A user change is required"
  });

export async function findPhoneFollowup(rawQuery: unknown) {
  const { phone: rawPhone } = phoneFollowupQuerySchema.parse(rawQuery);
  const phone = normalizeIranianPhone(rawPhone);
  const dataSource = await getDataSource();
  const user = await dataSource.getRepository(UserSchema)
      .createQueryBuilder("user")
      .leftJoin("orders", "order", "order.user_id = user.id")
      .select(["user.id", "user.full_name", "user.email", "user.phone", "user.role", "user.admin_followup_status", "user.admin_note", "user.created_at"])
      .addSelect("count(order.id)", "order_count")
      .where("user.phone = :phone and user.role = 'customer'", { phone })
      .groupBy("user.id")
      .getRawAndEntities();

  const foundUser = user.entities[0];
  return {
    phone,
    user: foundUser ? serializeAdminUser({ ...foundUser, order_count: Number(user.raw[0]?.order_count ?? 0) }) : null
  };
}

export async function updatePhoneFollowup(rawInput: unknown) {
  const input = phoneFollowupUpdateSchema.parse(rawInput);
  const repo = (await getDataSource()).getRepository(UserSchema);
  const user = await repo.findOneBy({ id: input.id });
  if (!user) throw new ApiError(404, "User not found");
  if (user.role !== "customer") throw new ApiError(403, "Only customer users can be followed up");
  return updateAdminUser({
    id: input.id,
    admin_followup_status: input.admin_followup_status,
    admin_note: input.admin_note
  });
}
