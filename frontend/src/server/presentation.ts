import { INFORMATION_SOURCE_EXTENSIONS, isInformationSource, isPresentationOrder } from "../lib/presentation";
import { ApiError } from "./http";

export function assertPresentationSource(order: { order_type: string | null; files?: Array<{ file_type: string; original_name: string; size_bytes: number }> }): void {
  if (isPresentationOrder(order) && !order.files?.some(isInformationSource)) {
    throw new ApiError(422, "برای ارائه و پاورپوینت، بارگذاری حداقل یک فایل «منبع اطلاعات» خواندنی الزامی است.");
  }
}

export async function validateInformationSource(file: File): Promise<void> {
  const extension = INFORMATION_SOURCE_EXTENSIONS.find(ext => file.name.toLowerCase().endsWith(ext));
  if (!extension || !file.size || file.size > 50 * 1024 * 1024) {
    throw new ApiError(422, "منبع اطلاعات باید فایل غیرخالی DOCX، PDF، PPTX، TXT یا MD و حداکثر ۵۰ مگابایت باشد.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if ((extension === ".pdf" && signature !== "%PDF-") ||
      ([".docx", ".pptx"].includes(extension) && !(bytes[0] === 0x50 && bytes[1] === 0x4b))) {
    throw new ApiError(422, "محتوای فایل منبع اطلاعات با پسوند آن هم‌خوان نیست.");
  }
  if ([".txt", ".md"].includes(extension)) {
    try {
      if (!new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim()) throw new Error("empty");
    } catch {
      throw new ApiError(422, "فایل متنی منبع اطلاعات باید متن غیرخالی با کدگذاری UTF-8 باشد.");
    }
  }
}
