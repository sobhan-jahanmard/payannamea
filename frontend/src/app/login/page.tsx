"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogIn, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAuth } from "../../components/auth/AuthProvider";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const phoneSchema = z.object({
  phone: z.string().trim().min(10, "شماره موبایل معتبر نیست").max(40, "شماره موبایل معتبر نیست")
});
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{4,8}$/, "کد تأیید معتبر نیست") });
const adminSchema = z.object({
  email: z.string().email("ایمیل معتبر نیست"),
  password: z.string().min(1, "رمز عبور را وارد کنید")
});

type PhoneValues = z.infer<typeof phoneSchema>;
type CodeValues = z.infer<typeof codeSchema>;
type AdminValues = z.infer<typeof adminSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, requestOtp, verifyOtp, user } = useAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneForm = useForm<PhoneValues>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<CodeValues>({ resolver: zodResolver(codeSchema) });
  const adminForm = useForm<AdminValues>({ resolver: zodResolver(adminSchema) });

  async function sendCode(values: PhoneValues) {
    setError(null);
    try {
      const normalizedInput = values.phone.trim();
      const result = await requestOtp(normalizedInput);
      setPhone(normalizedInput);
      setChallengeId(result.challenge_id);
      setDevCode(result.dev_code ?? null);
      if (result.dev_code) codeForm.setValue("code", result.dev_code);
      trackAnalyticsEvent("otp_requested");
    } catch (requestError) {
      trackAnalyticsEvent("otp_request_failed");
      setError(requestError instanceof Error ? requestError.message : "ارسال کد ناموفق بود");
    }
  }

  async function submitCode(values: CodeValues) {
    if (!challengeId) return;
    setError(null);
    try {
      await verifyOtp({ phone, challenge_id: challengeId, code: values.code.trim() });
      trackAnalyticsEvent("customer_login_completed");
      router.push("/orders");
    } catch (verifyError) {
      trackAnalyticsEvent("customer_login_failed");
      setError(verifyError instanceof Error ? verifyError.message : "تأیید شماره ناموفق بود");
    }
  }

  async function submitAdmin(values: AdminValues) {
    setError(null);
    try {
      await login({ email: values.email.trim(), password: values.password });
      trackAnalyticsEvent("admin_login_completed");
      router.push("/admin");
    } catch (loginError) {
      trackAnalyticsEvent("admin_login_failed");
      setError(loginError instanceof Error ? loginError.message : "ورود ناموفق بود");
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10 lg:px-8">
      <section className="tool-surface p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold">ورود یا ثبت‌نام</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            شماره موبایل خود را وارد کنید؛ اگر حسابی نداشته باشید، خودکار ساخته می‌شود.
          </p>
        </div>

        {user ? (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            شما با شماره <span className="ltr inline-block">{user.phone}</span> وارد شده‌اید.
          </div>
        ) : null}

        {!adminMode && !challengeId ? (
          <form
            onSubmit={phoneForm.handleSubmit(sendCode)}
            className="grid gap-4"
            data-analytics-form="phone_login_form"
          >
            <div className="space-y-2">
              <Label>شماره موبایل</Label>
              <Input className="ltr text-left" type="tel" inputMode="tel" autoComplete="tel" placeholder="09123456789" {...phoneForm.register("phone")} />
              {phoneForm.formState.errors.phone ? <p className="text-xs font-medium text-red-700">{phoneForm.formState.errors.phone.message}</p> : null}
            </div>
            {error ? <ErrorBox message={error} /> : null}
            <Button type="submit" loading={phoneForm.formState.isSubmitting}>
              <Phone className="h-4 w-4" aria-hidden="true" />
              دریافت کد تأیید
            </Button>
          </form>
        ) : null}

        {!adminMode && challengeId ? (
          <form
            onSubmit={codeForm.handleSubmit(submitCode)}
            className="grid gap-4"
            data-analytics-form="otp_verification_form"
          >
            <div className="rounded-md bg-muted px-4 py-3 text-sm">
              کد تأیید برای <span className="ltr inline-block font-medium">{phone}</span> ارسال شد.
            </div>
            <div className="space-y-2">
              <Label>کد تأیید</Label>
              <Input className="ltr text-center text-lg tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} {...codeForm.register("code")} />
              {codeForm.formState.errors.code ? <p className="text-xs font-medium text-red-700">{codeForm.formState.errors.code.message}</p> : null}
            </div>
            {devCode ? <p className="text-xs text-amber-800">کد محیط توسعه: {devCode}</p> : null}
            {error ? <ErrorBox message={error} /> : null}
            <Button type="submit" loading={codeForm.formState.isSubmitting}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              تأیید و ورود
            </Button>
            <Button type="button" variant="outline" onClick={() => { setChallengeId(null); setError(null); }}>
              اصلاح شماره یا دریافت کد تازه
            </Button>
          </form>
        ) : null}

        {adminMode ? (
          <form
            onSubmit={adminForm.handleSubmit(submitAdmin)}
            className="grid gap-4"
            data-analytics-form="admin_login_form"
          >
            <div className="space-y-2">
              <Label>ایمیل مدیر</Label>
              <Input className="ltr text-left" type="email" autoComplete="email" {...adminForm.register("email")} />
              {adminForm.formState.errors.email ? <p className="text-xs font-medium text-red-700">{adminForm.formState.errors.email.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>رمز عبور</Label>
              <Input className="ltr text-left" type="password" autoComplete="current-password" {...adminForm.register("password")} />
              {adminForm.formState.errors.password ? <p className="text-xs font-medium text-red-700">{adminForm.formState.errors.password.message}</p> : null}
            </div>
            {error ? <ErrorBox message={error} /> : null}
            <Button type="submit" loading={adminForm.formState.isSubmitting}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              ورود مدیر
            </Button>
          </form>
        ) : null}

        <button
          type="button"
          className="mt-5 text-xs font-medium text-muted-foreground hover:text-primary"
          onClick={() => { setAdminMode((value) => !value); setChallengeId(null); setError(null); }}
          data-analytics-event="login_mode_toggled"
        >
          {adminMode ? "بازگشت به ورود با موبایل" : "ورود مدیر سامانه"}
        </button>
      </section>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{message}</div>;
}
