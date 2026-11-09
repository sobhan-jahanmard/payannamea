import { randomUUID } from "node:crypto";

import { getDataSource } from "./db/data-source";
import { UserSchema } from "./db/entities";
import { email } from "./email";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./phone";

export async function loginWithPhone(
  rawPhone: string,
  rawUtmSource?: string | null,
  signupIp?: string | null
) {
  const phone = normalizeIranianPhone(rawPhone);
  const utmSource = rawUtmSource?.trim().slice(0, 100) || null;
  const dataSource = await getDataSource();
  const result = await dataSource.transaction(async (manager) => {
    // Share the lock with staff-created customers and consultation requests.
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [phone]);
    const repo = manager.getRepository(UserSchema);
    let user = await repo.findOneBy({ phone });
    if (user) {
      if (user.role !== "customer") {
        throw new ApiError(403, "برای ورود مدیر یا اپراتور از نام کاربری و رمز عبور استفاده کنید");
      }
      let changed = false;
      if (!user.utm_source && utmSource) {
        user.utm_source = utmSource;
        changed = true;
      }
      if (!user.signup_ip && signupIp) {
        user.signup_ip = signupIp;
        changed = true;
      }
      if (changed) user = await repo.save(user);
      return { user, isNewUser: false };
    }

    user = await repo.save({
      id: randomUUID(),
      phone,
      full_name: null,
      username: null,
      email: null,
      password_hash: null,
      role: "customer",
      // Phone-only login does not establish ownership of the number.
      is_verified: false,
      admin_followup_status: "new",
      admin_note: "",
      reset_token_hash: null,
      reset_token_expires_at: null,
      utm_source: utmSource,
      signup_ip: signupIp ?? null
    });
    return { user, isNewUser: true };
  });

  if (result.isNewUser) await email.sendNewUserSignup(phone);
  return result.user;
}
