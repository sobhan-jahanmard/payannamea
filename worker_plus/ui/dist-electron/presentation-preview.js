"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.presentationPreview = presentationPreview;
const node_fs_1 = require("node:fs");
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
const sha = (file) => (0, node_crypto_1.createHash)("sha256").update((0, node_fs_1.readFileSync)(file)).digest("hex");
function presentationPreview(root, expectedOrder, number) {
    const context = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(root, "order_context.json"), "utf8"));
    if (!expectedOrder || context.order_id !== expectedOrder)
        throw new Error("پیش‌نمایش متعلق به سفارش انتخاب‌شده نیست.");
    const file = node_path_1.default.join(root, "reports/presentation_preview.json");
    if (!(0, node_fs_1.existsSync)(file))
        throw new Error("پیش‌نمایش پس از ساخت ارائه با موتور جدید آماده می‌شود.");
    const preview = JSON.parse((0, node_fs_1.readFileSync)(file, "utf8"));
    if (preview.order_id !== expectedOrder || !Array.isArray(preview.slides))
        throw new Error("اطلاعات پیش‌نمایش با سفارش مطابقت ندارد.");
    if (number == null)
        return { ...preview, rendered: undefined, ready: Boolean(preview.rendered) };
    if (!Number.isInteger(number) || number < 1 || number > preview.slides.length)
        throw new Error("شماره اسلاید معتبر نیست.");
    const rendered = preview.rendered;
    if (!rendered)
        return { ...preview.slides[number - 1], image: null };
    if (sha(node_path_1.default.join(root, "final/final.pptx")) !== rendered.pptx_sha256 || sha(node_path_1.default.join(root, "final/final.pdf")) !== rendered.pdf_sha256)
        throw new Error("فایل ارائه تغییر کرده؛ پیش‌نمایش را از مرحله رندر بازسازی کنید.");
    const image = node_path_1.default.join(root, `reports/rendered_slides/slide-${String(number).padStart(3, "0")}.png`);
    if (sha(image) !== rendered.slides[number - 1]?.sha256)
        throw new Error("تصویر اسلاید با نسخه ثبت‌شده تطابق ندارد.");
    return { ...preview.slides[number - 1], image: `data:image/png;base64,${(0, node_fs_1.readFileSync)(image).toString("base64")}` };
}
