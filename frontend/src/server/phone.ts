import { isIP } from "node:net";

import { ApiError } from "./http";

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

export function getRequestIp(request: Request): string | null {
  // Only persist valid IPs supplied by the reverse proxy.
  const candidates = [
    request.headers.get("cf-connecting-ip")?.trim(),
    request.headers.get("x-real-ip")?.trim(),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  ];
  return candidates.find((candidate) => candidate && isIP(candidate) !== 0) ?? null;
}
