"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAuth } from "../../components/auth/AuthProvider";
import { PhoneAuthForm } from "../../components/auth/PhoneAuthForm";
import { clearCapturedUtmSource, trackAnalyticsEvent } from "../../lib/analytics";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const adminSchema = z.object({
  username: z.string().trim().min(1, "نام کاربری یا ایمیل را وارد کنید").max(255),
  password: z.string().min(1, "رمز عبور را وارد کنید")
});

type AdminValues = z.infer<typeof adminSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [adminMode, setAdminMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminForm = useForm<AdminValues>({ resolver: zodResolver(adminSchema) });

  function onCustomerAuthenticated() {
    clearCapturedUtmSource();
    trackAnalyticsEvent("customer_login_completed");
    router.push("/orders");
  }

  async function submitAdmin(values: AdminValues) {
    setError(null);
    try {
      await login({ username: values.username.trim(), password: values.password });
      trackAnalyticsEvent("staff_login_completed");
      router.push("/orders");
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
            شماره موبایل خود را وارد کنید. هنگام ثبت‌نام رمز عبور تعیین می‌کنید و برای ورودهای بعدی از شماره و رمز استفاده خواهید کرد.
          </p>
          <p id="phone-login-hint" className="mt-3 rounded-md bg-teal-50 p-3 text-sm leading-7 text-teal-900">
            شماره‌ای را وارد کنید که در تلگرام فعال است؛ ارتباط و هماهنگی سفارش‌ها از طریق تلگرامِ همین شماره خواهد بود.
          </p>
        </div>

        {user ? (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            شما با شماره <span className="ltr inline-block">{user.phone}</span> وارد شده‌اید.
          </div>
        ) : null}

        {!adminMode ? (
          <PhoneAuthForm onAuthenticated={onCustomerAuthenticated} />
        ) : null}

        {adminMode ? (
          <form
            onSubmit={adminForm.handleSubmit(submitAdmin)}
            className="grid gap-4"
            data-analytics-form="admin_login_form"
          >
            <div className="space-y-2">
              <Label>نام کاربری یا ایمیل</Label>
              <Input className="ltr text-left" autoComplete="username" {...adminForm.register("username")} />
              {adminForm.formState.errors.username ? <p className="text-xs font-medium text-red-700">{adminForm.formState.errors.username.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>رمز عبور</Label>
              <Input className="ltr text-left" type="password" autoComplete="current-password" {...adminForm.register("password")} />
              {adminForm.formState.errors.password ? <p className="text-xs font-medium text-red-700">{adminForm.formState.errors.password.message}</p> : null}
            </div>
            {error ? <ErrorBox message={error} /> : null}
            <Button type="submit" loading={adminForm.formState.isSubmitting}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              ورود کارکنان
            </Button>
          </form>
        ) : null}

        <button
          type="button"
          className="mt-5 text-xs font-medium text-muted-foreground hover:text-primary"
          onClick={() => { setAdminMode((value) => !value); setError(null); }}
          data-analytics-event="login_mode_toggled"
        >
          {adminMode ? "بازگشت به ورود با موبایل" : "ورود مدیر یا اپراتور"}
        </button>
      </section>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{message}</div>;
}
