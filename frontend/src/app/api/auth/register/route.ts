import { json } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return json({ detail: "برای ورود یا ثبت‌نام از کد تأیید موبایل استفاده کنید" }, 410);
}
