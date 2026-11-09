import { z } from "zod";

export const passwordSetupSchema = z.object({
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد").max(128, "رمز عبور باید حداکثر ۱۲۸ کاراکتر باشد").regex(/\S/, "رمز عبور نمی‌تواند فقط فاصله باشد"),
  password_confirmation: z.string().min(1, "تکرار رمز عبور را وارد کنید").max(128)
}).refine((value) => value.password === value.password_confirmation, {
  path: ["password_confirmation"],
  message: "رمز عبور و تکرار آن یکسان نیستند"
});

export const CONSULTATION_ALREADY_REGISTERED = "درخواست مشاوره شما از قبل ثبت شده است.";
export const CONSULTATION_REGISTERED = "درخواست مشاوره شما ثبت شد؛ به‌زودی از طریق تلگرامِ همین شماره با شما در ارتباط خواهیم بود.";
