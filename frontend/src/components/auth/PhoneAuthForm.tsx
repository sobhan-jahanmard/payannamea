"use client";

import { LockKeyhole, Phone } from "lucide-react";
import { useState } from "react";

import { captureUtmSource } from "../../lib/analytics";
import { getPhoneAuthStatus } from "../../lib/api";
import { CONSULTATION_ALREADY_REGISTERED, passwordSetupSchema } from "../../lib/phone-auth-schema";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useAuth } from "./AuthProvider";

export function PhoneAuthForm({ purpose = "login", onAuthenticated }: {
  purpose?: "login" | "consultation";
  onAuthenticated: () => void | Promise<void>;
}) {
  const { loginPhone } = useAuth();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "login" | "setup">("phone");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const prefix = `${purpose}-auth`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (step === "phone") {
        const status = await getPhoneAuthStatus(phone.trim());
        if (purpose === "consultation" && status.exists) {
          setNotice(CONSULTATION_ALREADY_REGISTERED);
          return;
        }
        if (status.next_step === "staff") {
          setError("برای ورود مدیر یا اپراتور از نام کاربری و رمز عبور استفاده کنید");
          return;
        }
        setStep(status.next_step);
        return;
      }
      if (step === "setup") {
        const validation = passwordSetupSchema.safeParse({ password, password_confirmation: confirmation });
        if (!validation.success) {
          setError(validation.error.issues[0].message);
          return;
        }
      }
      await loginPhone({
        phone: phone.trim(), password,
        ...(step === "setup" ? { password_confirmation: confirmation } : {}),
        purpose, utm_source: captureUtmSource()
      });
      setPassword("");
      setConfirmation("");
      await onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ثبت اطلاعات ناموفق بود؛ دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" data-analytics-form={purpose === "consultation" ? "consultation_form" : "phone_login_form"}>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-phone`}>شماره موبایل فعال در تلگرام</Label>
        <Input id={`${prefix}-phone`} className="ltr bg-white text-left" type="tel" inputMode="tel" autoComplete="username" placeholder="09123456789" maxLength={40} value={phone} readOnly={step !== "phone"} disabled={loading} onChange={(event) => { setPhone(event.target.value); setError(null); setNotice(null); }} required />
      </div>
      {step !== "phone" ? (
        <>
          <p className="rounded-md bg-teal-50 p-3 text-sm leading-7 text-teal-900">
            {step === "setup" ? "برای تکمیل ثبت‌نام، رمز عبور خود را دو بار وارد کنید. برای ورودهای بعدی به شماره موبایل و همین رمز نیاز دارید." : "برای ورود به حساب، رمز عبور این شماره را وارد کنید."}
          </p>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-password`}>{step === "setup" ? "رمز عبور جدید" : "رمز عبور"}</Label>
            <Input id={`${prefix}-password`} className="ltr bg-white text-left" type="password" autoComplete={step === "setup" ? "new-password" : "current-password"} minLength={step === "setup" ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} required aria-describedby={step === "setup" ? `${prefix}-password-hint` : undefined} />
            {step === "setup" ? <p id={`${prefix}-password-hint`} className="text-xs text-muted-foreground">حداقل ۸ کاراکتر</p> : null}
          </div>
          {step === "setup" ? (
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-confirmation`}>تکرار رمز عبور</Label>
              <Input id={`${prefix}-confirmation`} className="ltr bg-white text-left" type="password" autoComplete="new-password" maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={loading} required />
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-7 text-teal-900">{notice}</div> : null}
      <Button type="submit" loading={loading} className="min-h-11 w-full">
        {step === "phone" ? <Phone className="h-4 w-4" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
        {step === "phone" ? "ادامه با شماره موبایل" : step === "login" ? "ورود با رمز عبور" : purpose === "consultation" ? "تعیین رمز و ثبت مشاوره" : "تعیین رمز و تکمیل ثبت‌نام"}
      </Button>
      {step !== "phone" ? <Button type="button" variant="outline" disabled={loading} onClick={() => { setStep("phone"); setPassword(""); setConfirmation(""); setError(null); setNotice(null); }}>اصلاح شماره موبایل</Button> : null}
    </form>
  );
}
