import { z } from "zod";

import { getDataSource } from "./db/data-source";
import { UserSchema } from "./db/entities";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./otp";
import { serializeAdminUser, updateAdminUser } from "./users";

export const phoneFollowupQuerySchema = z.object({
  phone: z.string().trim().min(1).max(40)
});

export const newFollowupsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
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
      .select(["user.id", "user.full_name", "user.email", "user.phone", "user.role", "user.admin_followup_status", "user.admin_note", "user.created_at", "user.updated_at"])
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

/**
 * Returns the same candidates included in the new-followups email report.
 * This is deliberately staff-only at the route layer.
 */
export async function listNewFollowups(rawQuery: unknown) {
  const query = newFollowupsQuerySchema.parse(rawQuery);
  const dataSource = await getDataSource();
  const offset = (query.page - 1) * query.limit;

  const [users, countRows] = await Promise.all([
    dataSource.query(
      `select u.id, u.full_name, u.email, u.phone, u.role, u.is_verified,
              u.admin_followup_status, u.admin_note, u.utm_source,
              u.created_at, u.updated_at, count(o.id)::int as order_count
         from users u
         left join orders o on o.user_id = u.id
        where u.role = 'customer' and u.admin_followup_status = 'new'
        group by u.id
        order by u.created_at desc, u.id desc
        limit $1 offset $2`,
      [query.limit, offset],
    ),
    dataSource.query(
      `select count(*)::int as count
         from users
        where role = 'customer' and admin_followup_status = 'new'`,
    ),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  return {
    users: users.map(serializeAdminUser),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
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
