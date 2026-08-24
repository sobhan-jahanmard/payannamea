import { captureUtmSource, clearCapturedUtmSource } from "./analytics";
import { getStoredToken } from "./api";

interface ConsultationResponse {
  id: string;
  message: string;
}

export async function requestFreeConsultation(): Promise<ConsultationResponse> {
  const token = getStoredToken();
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ source: "landing_page", utm_source: captureUtmSource() }),
  });

  const body = (await response.json().catch(() => null)) as
    | (Partial<ConsultationResponse> & { detail?: string | string[] })
    | null;

  if (!response.ok) {
    const detail = body?.detail;
    throw new Error(
      Array.isArray(detail)
        ? detail.join("، ")
        : detail || "ثبت درخواست ناموفق بود؛ دوباره تلاش کنید.",
    );
  }

  if (!body?.id || !body.message) {
    throw new Error("پاسخ نامعتبر از سرور دریافت شد.");
  }

  clearCapturedUtmSource();
  return { id: body.id, message: body.message };
}
