import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDataSource } from "./db/data-source";
import { UserSchema } from "./db/entities";
import { email } from "./email";
import { normalizeIranianPhone } from "./otp";

export const consultationLeadCreateSchema = z.object({
  phone: z.string().min(1).max(40),
  source: z.literal("landing_page").default("landing_page")
});

export async function createConsultationUser(rawInput: unknown) {
  const input = consultationLeadCreateSchema.parse(rawInput);
  const phone = normalizeIranianPhone(input.phone);
  const dataSource = await getDataSource();

  const result = await dataSource.transaction(async (manager) => {
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [`consultation:${phone}`]);
    const repo = manager.getRepository(UserSchema);
    const existing = await repo.findOneBy({ phone });
    if (existing) {
      if (existing.role === "customer" && !existing.is_verified) {
        existing.admin_followup_status = "new";
        await repo.save(existing);
      }
      return { user: existing, repeated: true, notify: false };
    }

    const user = await repo.save({
      id: randomUUID(),
      phone,
      full_name: null,
      email: null,
      password_hash: null,
      role: "customer",
      is_verified: false,
      admin_followup_status: "new",
      admin_note: "",
      reset_token_hash: null,
      reset_token_expires_at: null
    });
    return { user, repeated: false, notify: true };
  });

  if (result.notify) {
    await email.sendConsultationLead(phone, result.repeated);
  }
  return result.user;
}
