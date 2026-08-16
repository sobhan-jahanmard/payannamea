import crypto, { randomUUID } from "node:crypto";

import { MoreThan } from "typeorm";

import { appEnvironment, authSecret, msgWayApiKey, msgWayTemplateId } from "./config";
import { getDataSource } from "./db/data-source";
import { OtpChallengeSchema, UserSchema } from "./db/entities";
import { email } from "./email";
import { ApiError } from "./http";

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function normalizeIranianPhone(input: string): string {
  let value = input
    .trim()
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\s()-]/g, "");

  if (value.startsWith("+98")) value = `0${value.slice(3)}`;
  if (value.startsWith("0098")) value = `0${value.slice(4)}`;
  if (value.startsWith("98") && value.length === 12) value = `0${value.slice(2)}`;

  if (!/^09\d{9}$/.test(value)) {
    throw new ApiError(422, "شماره موبایل معتبر نیست");
  }
  return value;
}

function hashOtp(challengeId: string, phone: string, code: string): string {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`${challengeId}:${phone}:${code}`)
    .digest("hex");
}

async function sendWithMsgWay(phone: string, code: string): Promise<void> {
  const devCode = process.env.OTP_DEV_CODE?.trim();
  if (devCode && appEnvironment() !== "production") {
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.msgway.com/send", {
      method: "POST",
      headers: {
        "accept-language": "fa-IR",
        "content-type": "application/json",
        apiKey: msgWayApiKey()
      },
      body: JSON.stringify({
        method: "sms",
        mobile: phone,
        templateID: msgWayTemplateId(),
        code,
        expireTime: Math.floor(OTP_TTL_MS / 1000)
      }),
      cache: "no-store"
    });
  } catch {
    throw new ApiError(502, "ارسال کد تأیید در حال حاضر ممکن نیست");
  }
  const result = (await response.json().catch(() => null)) as {
    status?: string;
    error?: { code?: number; message?: string } | boolean;
    referenceID?: string;
  } | null;
  if (!response.ok || result?.status === "error" || !result?.referenceID) {
    const providerMessage = typeof result?.error === "object" ? result.error.message?.trim() : undefined;
    throw new ApiError(
      502,
      providerMessage ? `خطای راه‌پیام: ${providerMessage}` : "ارسال کد تأیید ناموفق بود"
    );
  }
}

export async function requestOtp(rawPhone: string): Promise<{ challenge_id: string; expires_in: number; dev_code?: string }> {
  const phone = normalizeIranianPhone(rawPhone);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(OtpChallengeSchema);
  const recent = await repo.findOne({
    where: { phone, created_at: MoreThan(new Date(Date.now() - OTP_RESEND_MS)) },
    order: { created_at: "DESC" }
  });
  if (recent) {
    throw new ApiError(429, "برای ارسال دوباره کد، یک دقیقه صبر کنید");
  }

  const challengeId = randomUUID();
  const configuredDevCode = process.env.OTP_DEV_CODE?.trim();
  const code = configuredDevCode && appEnvironment() !== "production"
    ? configuredDevCode
    : crypto.randomInt(100_000, 1_000_000).toString();
  const challenge = await repo.save({
    id: challengeId,
    phone,
    code_hash: hashOtp(challengeId, phone, code),
    expires_at: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    consumed_at: null
  });

  try {
    await sendWithMsgWay(phone, code);
  } catch (error) {
    await repo.delete({ id: challenge.id });
    throw error;
  }

  return {
    challenge_id: challenge.id,
    expires_in: Math.floor(OTP_TTL_MS / 1000),
    ...(configuredDevCode && appEnvironment() !== "production" ? { dev_code: configuredDevCode } : {})
  };
}

export async function verifyOtp(rawPhone: string, challengeId: string, code: string) {
  const phone = normalizeIranianPhone(rawPhone);
  const dataSource = await getDataSource();

  const result = await dataSource.transaction(async (manager) => {
    const challengeRepo = manager.getRepository(OtpChallengeSchema);
    const challenge = await challengeRepo.findOne({
      where: { id: challengeId, phone },
      lock: { mode: "pessimistic_write" }
    });
    if (!challenge || challenge.consumed_at || challenge.expires_at.getTime() <= Date.now()) {
      throw new ApiError(401, "کد تأیید منقضی یا نامعتبر است");
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new ApiError(429, "تعداد تلاش‌ها بیش از حد مجاز است؛ کد تازه‌ای بگیرید");
    }

    const actual = Buffer.from(hashOtp(challenge.id, phone, code));
    const expected = Buffer.from(challenge.code_hash);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      challenge.attempts += 1;
      await challengeRepo.save(challenge);
      return { error: "invalid" as const };
    }

    challenge.consumed_at = new Date();
    await challengeRepo.save(challenge);

    // Different valid challenges for the same phone must not create duplicate users.
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [phone]);
    const userRepo = manager.getRepository(UserSchema);
    let user = await userRepo.findOneBy({ phone });
    let isNewUser = false;
    if (!user) {
      user = await userRepo.save({
        id: randomUUID(),
        phone,
        full_name: null,
        email: null,
        password_hash: null,
        role: "customer",
        reset_token_hash: null,
        reset_token_expires_at: null
      });
      isNewUser = true;
    }
    return { user, isNewUser };
  });

  if ("error" in result) {
    throw new ApiError(401, "کد تأیید نادرست است");
  }
  if (result.isNewUser) {
    await email.sendNewUserSignup(result.user.phone ?? phone);
  }
  return result.user;
}
