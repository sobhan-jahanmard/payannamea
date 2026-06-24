"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAuth } from "../../components/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const formSchema = z.object({
  email: z.string().email("ایمیل معتبر نیست"),
  password: z.string().min(1, "رمز عبور را وارد کنید")
});

type FormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema)
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const loggedInUser = await login({ email: values.email.trim(), password: values.password });
      router.push(loggedInUser.role === "admin" ? "/admin" : "/orders");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ورود ناموفق بود");
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10 lg:px-8">
      <section className="tool-surface p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold">ورود به حساب</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            برای ثبت و پیگیری سفارش‌ها وارد شوید.
          </p>
        </div>

        {user ? (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            شما با حساب {user.full_name} وارد شده‌اید.
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="space-y-2">
            <Label>ایمیل (Email)</Label>
            <Input className="ltr text-left" type="email" autoComplete="email" {...register("email")} />
            {errors.email ? <p className="text-xs font-medium text-red-700">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>رمز عبور</Label>
            <Input className="ltr text-left" type="password" autoComplete="current-password" {...register("password")} />
            {errors.password ? <p className="text-xs font-medium text-red-700">{errors.password.message}</p> : null}
          </div>

          {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}

          <Button type="submit" loading={isSubmitting}>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            ورود
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
          <Link className="font-medium text-primary hover:underline" href="/register">
            حساب ندارید؟ ثبت‌نام
          </Link>
          <Link className="font-medium text-primary hover:underline" href="/forgot-password">
            فراموشی رمز عبور
          </Link>
        </div>
      </section>
    </main>
  );
}
