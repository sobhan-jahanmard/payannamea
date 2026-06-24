"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAuth } from "../../components/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { forgotPassword, resetPassword, storeAuthSession } from "../../lib/api";

const requestSchema = z.object({
  email: z.string().email("ایمیل معتبر نیست")
});

const resetSchema = z.object({
  token: z.string().min(16, "توکن معتبر نیست"),
  new_password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
});

type RequestValues = z.infer<typeof requestSchema>;
type ResetValues = z.infer<typeof resetSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const requestForm = useForm<RequestValues>({ resolver: zodResolver(requestSchema) });
  const resetForm = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  async function requestReset(values: RequestValues) {
    setError(null);
    setMessage(null);
    try {
      const result = await forgotPassword(values.email.trim());
      setMessage("اگر حسابی با این ایمیل وجود داشته باشد، امکان تغییر رمز آماده شده است.");
      if (result.reset_token) {
        setDevToken(result.reset_token);
        resetForm.setValue("token", result.reset_token);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ارسال درخواست ناموفق بود");
    }
  }

  async function submitReset(values: ResetValues) {
    setError(null);
    try {
      const session = await resetPassword(values.token.trim(), values.new_password);
      storeAuthSession(session);
      await refresh();
      router.push("/orders");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "تغییر رمز عبور ناموفق بود");
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-5 px-4 py-10 lg:px-8">
      <section className="tool-surface p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold">فراموشی رمز عبور</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            در نسخه محلی، توکن تغییر رمز همین‌جا نمایش داده می‌شود تا تست سریع باشد.
          </p>
        </div>

        <form onSubmit={requestForm.handleSubmit(requestReset)} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label>ایمیل (Email)</Label>
            <Input className="ltr text-left" type="email" autoComplete="email" {...requestForm.register("email")} />
            {requestForm.formState.errors.email ? (
              <p className="text-xs font-medium text-red-700">{requestForm.formState.errors.email.message}</p>
            ) : null}
          </div>
          <Button type="submit" loading={requestForm.formState.isSubmitting}>
            <MailCheck className="h-4 w-4" aria-hidden="true" />
            دریافت توکن
          </Button>
        </form>

        {message ? <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div> : null}
        {devToken ? (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="font-semibold">توکن محلی:</span>{" "}
            <span className="ltr inline-block break-all text-left">{devToken}</span>
          </div>
        ) : null}

        <form onSubmit={resetForm.handleSubmit(submitReset)} className="mt-6 grid gap-4">
          <div className="space-y-2">
            <Label>توکن تغییر رمز</Label>
            <Input className="ltr text-left" {...resetForm.register("token")} />
            {resetForm.formState.errors.token ? (
              <p className="text-xs font-medium text-red-700">{resetForm.formState.errors.token.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>رمز عبور جدید</Label>
            <Input className="ltr text-left" type="password" autoComplete="new-password" {...resetForm.register("new_password")} />
            {resetForm.formState.errors.new_password ? (
              <p className="text-xs font-medium text-red-700">{resetForm.formState.errors.new_password.message}</p>
            ) : null}
          </div>

          {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}

          <Button type="submit" loading={resetForm.formState.isSubmitting}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            تغییر رمز و ورود
          </Button>
        </form>
      </section>
    </main>
  );
}
