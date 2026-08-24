"use client";

import { CheckCircle2, Headphones, KeyRound, Phone, PhoneCall } from "lucide-react";
import { useState } from "react";

import { trackAnalyticsEvent } from "../../lib/analytics";
import { requestFreeConsultation } from "../../lib/consultation-api";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function FreeConsultationForm() {
  const { requestOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestOtp(phone.trim());
      setChallengeId(result.challenge_id);
      setDevCode(result.dev_code ?? null);
      if (result.dev_code) setCode(result.dev_code);
      trackAnalyticsEvent("consultation_otp_requested", {
        location: "landing_hero",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "ارسال کد تأیید ناموفق بود؛ دوباره تلاش کنید.",
      );
      trackAnalyticsEvent("consultation_otp_request_failed", {
        location: "landing_hero",
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await verifyOtp({ phone, challenge_id: challengeId, code: code.trim() });
      const result = await requestFreeConsultation();
      setMessage(result.message);
      setPhone("");
      setCode("");
      setChallengeId(null);
      setDevCode(null);
      trackAnalyticsEvent("consultation_lead_submitted", { location: "landing_hero" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تأیید شماره یا ثبت درخواست ناموفق بود؛ دوباره تلاش کنید.");
      trackAnalyticsEvent("consultation_lead_failed", { location: "landing_hero" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="rounded-lg border border-white/45 bg-white/82 p-5 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-[32px] sm:p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-teal-100 text-teal-800">
        <Headphones className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold">درخواست مشاوره رایگان</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">
        اگر درباره انتخاب خدمت، مراحل انجام، زمان یا هزینه سؤال دارید، شماره
        موبایل خود را وارد کنید. کارشناسان ما برای بررسی اولیه و راهنمایی با شما
        تماس می‌گیرند.
      </p>

      {!challengeId ? <form
        onSubmit={sendCode}
        className="mt-5 grid gap-3"
        data-analytics-form="consultation_form"
      >
        <div className="space-y-2">
          <Label htmlFor="consultation-phone">شماره موبایل</Label>
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
          <Phone className="h-4 w-4" aria-hidden="true" />
          دریافت کد تأیید
        </Button>
      </form> : <form onSubmit={submitCode} className="mt-5 grid gap-3" data-analytics-form="consultation_otp_form">
        <div className="rounded-md bg-teal-50 p-3 text-sm leading-6 text-teal-900">
          کد تأیید برای <span className="ltr inline-block font-medium">{phone}</span> ارسال شد.
        </div>
        <div className="space-y-2">
          <Label htmlFor="consultation-code">کد تأیید</Label>
          <Input id="consultation-code" className="ltr bg-white text-center text-lg tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} required />
        </div>
        {devCode ? <p className="text-xs text-amber-800">کد محیط توسعه: {devCode}</p> : null}
        <Button type="submit" loading={loading} className="w-full">
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          تأیید و ثبت درخواست تماس
        </Button>
        <Button type="button" variant="outline" onClick={() => { setChallengeId(null); setCode(""); setDevCode(null); setError(null); }}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          اصلاح شماره یا دریافت کد تازه
        </Button>
      </form>}

      {message ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </aside>
  );
}
