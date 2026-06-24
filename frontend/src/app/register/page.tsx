"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
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
  full_name: z.string().min(2, "نام و نام خانوادگی را وارد کنید"),
  phone: z.string().min(7, "شماره تماس معتبر نیست").max(40, "شماره تماس بیش از حد طولانی است"),
  email: z.string().email("ایمیل معتبر نیست"),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
});

type FormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
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
      await registerUser({
        full_name: values.full_name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        password: values.password
      });
      router.push("/order");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "ثبت‌نام ناموفق بود");
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-md gap-5 px-4 py-10 lg:px-8">
      <section className="tool-surface p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold">ساخت حساب کاربری</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            شماره تماس برای هماهنگی سفارش دریافت می‌شود.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="space-y-2">
            <Label>نام و نام خانوادگی</Label>
            <Input autoComplete="name" {...register("full_name")} />
            {errors.full_name ? <p className="text-xs font-medium text-red-700">{errors.full_name.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>شماره تماس</Label>
            <Input className="ltr text-left" autoComplete="tel" {...register("phone")} />
            {errors.phone ? <p className="text-xs font-medium text-red-700">{errors.phone.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>ایمیل (Email)</Label>
            <Input className="ltr text-left" type="email" autoComplete="email" {...register("email")} />
            {errors.email ? <p className="text-xs font-medium text-red-700">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>رمز عبور</Label>
            <Input className="ltr text-left" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password ? <p className="text-xs font-medium text-red-700">{errors.password.message}</p> : null}
          </div>

          {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}

          <Button type="submit" loading={isSubmitting}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            ثبت‌نام
          </Button>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          حساب دارید؟{" "}
          <Link className="font-medium text-primary hover:underline" href="/login">
            ورود
          </Link>
        </p>
      </section>
    </main>
  );
}
