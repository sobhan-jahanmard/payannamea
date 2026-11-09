import { randomUUID } from "node:crypto";

import { CONSULTATION_ALREADY_REGISTERED, passwordSetupSchema } from "../lib/phone-auth-schema";
import type { PhoneLoginPayload, PhoneAuthStatus } from "../types/api";
import { hashPassword, verifyPassword } from "./auth";
import { getDataSource } from "./db/data-source";
import { UserSchema } from "./db/entities";
import { email } from "./email";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./phone";

export async function getPhoneAuthStatus(rawPhone: string): Promise<PhoneAuthStatus> {
  const phone = normalizeIranianPhone(rawPhone);
  const repo = (await getDataSource()).getRepository(UserSchema);
  const user = await repo.findOneBy({ phone });
  return {
    exists: Boolean(user),
    next_step: user && user.role !== "customer" ? "staff" : user?.password_hash ? "login" : "setup"
  };
}

export async function loginWithPhone(input: PhoneLoginPayload, signupIp?: string | null) {
  const phone = normalizeIranianPhone(input.phone);
  const utmSource = input.utm_source?.trim().slice(0, 100) || null;
  const dataSource = await getDataSource();
  const result = await dataSource.transaction(async (manager) => {
    // Share the lock with staff-created customers and consultation requests.
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [phone]);
    const repo = manager.getRepository(UserSchema);
    let user = await repo.findOneBy({ phone });
    if (user && input.purpose === "consultation") {
      throw new ApiError(409, CONSULTATION_ALREADY_REGISTERED);
    }
    if (user) {
      if (user.role !== "customer") {
        throw new ApiError(403, "برای ورود مدیر یا اپراتور از نام کاربری و رمز عبور استفاده کنید");
      }
      let changed = false;
      if (user.password_hash) {
        if (!verifyPassword(input.password, user.password_hash)) {
          throw new ApiError(401, "شماره موبایل یا رمز عبور نادرست است");
        }
      } else {
        // Existing customers and staff-created accounts choose a password once.
        passwordSetupSchema.parse(input);
        user.password_hash = hashPassword(input.password);
        changed = true;
      }
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

    passwordSetupSchema.parse(input);
    user = await repo.save({
      id: randomUUID(),
      phone,
      full_name: null,
      username: null,
      email: null,
      password_hash: hashPassword(input.password),
      role: "customer",
      // Password setup does not verify ownership of the phone number.
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
