"use client";

import { CheckCircle2, Headphones, Send } from "lucide-react";
import { useState } from "react";

import { captureUtmSource, trackAnalyticsEvent } from "../../lib/analytics";
import { requestFreeConsultation } from "../../lib/consultation-api";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function FreeConsultationForm() {
  const { loginPhone } = useAuth();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitConsultation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await loginPhone({ phone: phone.trim(), utm_source: captureUtmSource() });
      const result = await requestFreeConsultation();
      setMessage(result.message);
      setPhone("");
      trackAnalyticsEvent("consultation_lead_submitted", { location: "landing_hero" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ثبت درخواست ناموفق بود؛ دوباره تلاش کنید.");
      trackAnalyticsEvent("consultation_lead_failed", { location: "landing_hero" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="rounded-lg border border-white/60 bg-white/95 p-5 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-[32px] sm:p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-teal-100 text-teal-800">
        <Headphones className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold">درخواست مشاوره رایگان</h2>
      <p className="mt-2 text-sm leading-7 text-slate-800">
        اگر درباره انتخاب خدمت، مراحل انجام، زمان یا هزینه سؤال دارید، شماره
        موبایل فعال در تلگرام خود را وارد کنید. کارشناسان ما برای بررسی اولیه و راهنمایی
        از طریق تلگرامِ همین شماره با شما در ارتباط خواهند بود.
      </p>

      <form
        onSubmit={submitConsultation}
        className="mt-5 grid gap-3"
        data-analytics-form="consultation_form"
      >
        <div className="space-y-2">
          <Label htmlFor="consultation-phone">شماره موبایل فعال در تلگرام</Label>
          <Input
            id="consultation-phone"
            className="ltr bg-white text-left"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09123456789"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
            required
          />
        </div>
        <Button type="submit" loading={loading} className="w-full">
          <Send className="h-4 w-4" aria-hidden="true" />
          ثبت درخواست مشاوره در تلگرام
        </Button>
      </form>
      <p className="mt-3 text-xs leading-6 text-slate-600">با ثبت درخواست، حساب شما با همین شماره ساخته می‌شود؛ برای ورودهای بعدی هم همین شماره کافی است.</p>

      {message ? (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </aside>
  );
}
