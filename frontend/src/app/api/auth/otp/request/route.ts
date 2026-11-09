import { json } from "../../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return json({ detail: "ارسال کد تأیید غیرفعال است؛ برای ورود یا ثبت‌نام از شماره موبایل در /api/auth/phone استفاده کنید" }, 410);
}
