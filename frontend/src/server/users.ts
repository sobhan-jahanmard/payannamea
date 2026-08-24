import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDataSource } from "./db/data-source";
import { UserSchema, type UserEntity, type UserFollowupStatus } from "./db/entities";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./otp";

export const adminUserQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["new", "contacted", "closed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50)
});

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(max).nullable().optional()
);

export const adminUserUpdateSchema = z.object({
  id: z.string().uuid(),
  full_name: optionalText(255),
  email: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().email().max(255).nullable().optional()
  ),
  admin_followup_status: z.enum(["new", "contacted", "closed"]).optional(),
  admin_note: z.string().trim().max(2_000).optional()
}).refine((input) => (
  input.full_name !== undefined
  || input.email !== undefined
  || input.admin_followup_status !== undefined
  || input.admin_note !== undefined
), {
  message: "A user change is required"
});

type AdminUserRow = Pick<
  UserEntity,
  "id" | "full_name" | "email" | "phone" | "role" | "is_verified" | "admin_followup_status" | "admin_note" | "utm_source" | "created_at" | "updated_at"
> & {
  order_count: number;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeAdminUser(user: AdminUserRow) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    is_verified: user.is_verified,
    admin_followup_status: user.admin_followup_status,
    admin_note: user.admin_note ?? "",
    utm_source: user.utm_source ?? null,
    order_count: Number(user.order_count ?? 0),
    created_at: iso(user.created_at),
    updated_at: iso(user.updated_at)
  };
}

export async function listAdminUsers(rawQuery: unknown) {
  const query = adminUserQuerySchema.parse(rawQuery);
  const dataSource = await getDataSource();
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (query.status) {
    values.push(query.status);
    conditions.push(`u.admin_followup_status = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${query.search}%`);
    conditions.push(`(
      u.phone ilike $${values.length}
      or u.email ilike $${values.length}
      or u.full_name ilike $${values.length}
      or u.admin_note ilike $${values.length}
    )`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const offset = (query.page - 1) * query.limit;

  const [users, countRows, statusRows] = await Promise.all([
    dataSource.query(
      `select u.id, u.full_name, u.email, u.phone, u.role, u.is_verified, u.admin_followup_status, u.admin_note, u.utm_source, u.created_at, u.updated_at,
        count(o.id)::int as order_count
       from users u
       left join orders o on o.user_id = u.id
       ${where}
       group by u.id
       order by u.updated_at desc, u.id desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.limit, offset]
    ),
    dataSource.query(`select count(*)::int as count from users u ${where}`, values),
    dataSource.query(
      `select admin_followup_status as status, count(*)::int as count
       from users
       group by admin_followup_status
       order by admin_followup_status`
    )
  ]);

  const total = countRows[0]?.count ?? 0;
  return {
    users: users.map(serializeAdminUser),
    counts: Object.fromEntries(statusRows.map((row: { status: string; count: number }) => [row.status, row.count])),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit))
    }
  };
}

export async function updateAdminUser(rawInput: unknown) {
  const input = adminUserUpdateSchema.parse(rawInput);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(UserSchema);
  const user = await repo.findOneBy({ id: input.id });
  if (!user) throw new ApiError(404, "User not found");
  if ((input.full_name !== undefined || input.email !== undefined) && user.role !== "customer") {
    throw new ApiError(403, "Only customer users can be edited");
  }
  if (input.full_name !== undefined) {
    user.full_name = input.full_name;
  }
  if (input.email !== undefined) {
    if (input.email) {
      const existing = await repo.findOneBy({ email: input.email });
      if (existing && existing.id !== user.id) {
        throw new ApiError(409, "Email is already used by another user");
      }
    }
    user.email = input.email;
  }
  if (input.admin_followup_status !== undefined) {
    user.admin_followup_status = input.admin_followup_status as UserFollowupStatus;
  }
  if (input.admin_note !== undefined) {
    user.admin_note = input.admin_note;
  }
  const saved = await repo.save(user);
  const orderRows = await dataSource.query("select count(*)::int as count from orders where user_id = $1", [saved.id]);
  return serializeAdminUser({ ...saved, order_count: orderRows[0]?.count ?? 0 });
}

export async function deleteAdminUser(userId: string) {
  const id = z.string().uuid().parse(userId);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(UserSchema);
  const user = await repo.findOneBy({ id });
  if (!user) throw new ApiError(404, "User not found");
  if (user.role === "admin") {
    throw new ApiError(403, "Admin users cannot be deleted");
  }

  await dataSource.transaction(async (manager) => {
    if (user.role === "operator") {
      // Remove orders created by this operator; their dependent records cascade from orders.
      await manager.query("delete from orders where created_by_user_id = $1", [id]);
    }
    // orders.user_id is ON DELETE CASCADE; each order's dependent records also cascade.
    await manager.getRepository(UserSchema).delete({ id });
  });
}

export async function findCustomerByPhone(rawPhone: string): Promise<UserEntity> {
  const phone = normalizeIranianPhone(rawPhone);
  const user = await (await getDataSource()).getRepository(UserSchema).findOneBy({ phone, role: "customer" });
  if (!user) throw new ApiError(404, "Customer user not found");
  return user;
}

export async function findOrCreateCustomerByPhone(rawPhone: string): Promise<UserEntity> {
  const phone = normalizeIranianPhone(rawPhone);
  const dataSource = await getDataSource();

  return dataSource.transaction(async (manager) => {
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [phone]);
    const repo = manager.getRepository(UserSchema);
    const existing = await repo.findOneBy({ phone });
    if (existing) {
      if (existing.role !== "customer") {
        throw new ApiError(409, "This phone number belongs to a staff account");
      }
      return existing;
    }

    return repo.save({
      id: randomUUID(),
      phone,
      full_name: null,
      email: null,
      username: null,
      password_hash: null,
      role: "customer",
      is_verified: false,
      admin_followup_status: "new",
      admin_note: "",
      utm_source: null,
      reset_token_hash: null,
      reset_token_expires_at: null
    });
  });
}
