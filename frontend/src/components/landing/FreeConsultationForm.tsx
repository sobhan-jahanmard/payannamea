"use client";

import { CheckCircle2, Headphones } from "lucide-react";
import { useState } from "react";

import { clearCapturedUtmSource, trackAnalyticsEvent } from "../../lib/analytics";
import { CONSULTATION_REGISTERED } from "../../lib/phone-auth-schema";
import { PhoneAuthForm } from "../auth/PhoneAuthForm";

export function FreeConsultationForm() {
  const [message, setMessage] = useState<string | null>(null);

  function onConsultationRegistered() {
    clearCapturedUtmSource();
    setMessage(CONSULTATION_REGISTERED);
    trackAnalyticsEvent("consultation_lead_submitted", { location: "landing_hero" });
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

      {!message ? <div className="mt-5"><PhoneAuthForm purpose="consultation" onAuthenticated={onConsultationRegistered} /></div> : null}
      <p className="mt-3 text-xs leading-6 text-slate-600">برای شماره جدید، تعیین رمز عبور و تکرار آن الزامی است. ورودهای بعدی با شماره و رمز عبور انجام می‌شود.</p>

      {message ? (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </div>
      ) : null}
    </aside>
  );
}
