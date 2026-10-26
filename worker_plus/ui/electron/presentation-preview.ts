import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
export function presentationPreview(root: string, expectedOrder: string, number?: number) {
  const context = JSON.parse(readFileSync(path.join(root, "order_context.json"), "utf8"));
  if (!expectedOrder || context.order_id !== expectedOrder) throw new Error("پیش‌نمایش متعلق به سفارش انتخاب‌شده نیست.");
  const file = path.join(root, "reports/presentation_preview.json");
  if (!existsSync(file)) throw new Error("پیش‌نمایش پس از ساخت ارائه با موتور جدید آماده می‌شود.");
  const preview = JSON.parse(readFileSync(file, "utf8"));
  if (preview.order_id !== expectedOrder || !Array.isArray(preview.slides)) throw new Error("اطلاعات پیش‌نمایش با سفارش مطابقت ندارد.");
  if (number == null) return { ...preview, rendered: undefined, ready: Boolean(preview.rendered) };
  if (!Number.isInteger(number) || number < 1 || number > preview.slides.length) throw new Error("شماره اسلاید معتبر نیست.");
  const rendered = preview.rendered;
  if (!rendered) return { ...preview.slides[number - 1], image: null };
  if (sha(path.join(root, "final/final.pptx")) !== rendered.pptx_sha256 || sha(path.join(root, "final/final.pdf")) !== rendered.pdf_sha256) throw new Error("فایل ارائه تغییر کرده؛ پیش‌نمایش را از مرحله رندر بازسازی کنید.");
  const image = path.join(root, `reports/rendered_slides/slide-${String(number).padStart(3, "0")}.png`);
  if (sha(image) !== rendered.slides[number - 1]?.sha256) throw new Error("تصویر اسلاید با نسخه ثبت‌شده تطابق ندارد.");
  return { ...preview.slides[number - 1], image: `data:image/png;base64,${readFileSync(image).toString("base64")}` };
}
