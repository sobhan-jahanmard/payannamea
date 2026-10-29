import { z } from "zod";

export function normalizeOrderSearch(value: string) {
  return value.normalize("NFKC")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\s\u200c\u200d()+-]/g, "").toLowerCase();
}

// Keep the query and expression indexes identical. `column` is a static SQL
// identifier supplied by our code; search values are always bound parameters.
export function orderSearchExpression(column: string) {
  return `lower(regexp_replace(translate(normalize(coalesce(${column}, ''), NFKC),
    '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩يك', '01234567890123456789یک'),
    '[[:space:]‌‍ً-ٰٟـ()+-]', '', 'g'))`;
}

export const orderListQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export function orderSearchPattern(search: string) {
  return `%${normalizeOrderSearch(search).replace(/[\\%_]/g, "\\$&")}%`;
}
