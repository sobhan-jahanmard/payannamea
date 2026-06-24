import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, FileCheck2, FileText, Gauge, Presentation, SearchCheck, ShieldCheck } from "lucide-react";

import { Button } from "../components/ui/button";

const steps = [
  "ثبت دقیق مشخصات و فایل‌ها",
  "بررسی و تأیید سفارش توسط مدیر",
  "انجام کار و تحویل خروجی نهایی"
];

const features = [
  {
    icon: ClipboardList,
    title: "ثبت سفارش دقیق",
    body: "موضوع، دانشگاه، رشته، مرحله کار، منابع، شیوه‌نامه و فایل‌های لازم در یک فرم منظم دریافت می‌شود."
  },
  {
    icon: Gauge,
    title: "بررسی پیش از شروع",
    body: "هر سفارش ابتدا توسط مدیر بررسی می‌شود و فقط پس از تأیید وارد مسیر انجام می‌شود."
  },
  {
    icon: FileCheck2,
    title: "پیگیری و تحویل",
    body: "وضعیت سفارش، فایل‌های ثبت‌شده، یادداشت‌ها و خروجی نهایی همیشه از حساب کاربری قابل پیگیری است."
  }
];

const services = [
  {
    icon: FileText,
    title: "پایان‌نامه کارشناسی",
    body: "راهنمایی در انتخاب موضوع، تنظیم ساختار، گردآوری منابع، نگارش بخش‌ها و آماده‌سازی فایل نهایی مطابق خواسته دانشگاه."
  },
  {
    icon: FileText,
    title: "پایان‌نامه کارشناسی ارشد",
    body: "از انتخاب موضوع و پروپوزال تا نگارش فصل‌ها، تحلیل، و آماده‌سازی فایل نهایی طبق شیوه‌نامه دانشگاه."
  },
  {
    icon: FileCheck2,
    title: "رساله دکتری",
    body: "برنامه‌ریزی ساختار رساله، تنظیم فصل‌ها، یکپارچه‌سازی منابع، و آماده‌سازی خروجی قابل بازبینی."
  },
  {
    icon: ClipboardList,
    title: "پروپوزال پایان‌نامه",
    body: "تبدیل ایده اولیه به پروپوزال منظم شامل مسئله پژوهش، اهداف، پرسش‌ها، روش انجام و منابع اولیه."
  },
  {
    icon: SearchCheck,
    title: "تحقیق دانشگاهی",
    body: "تهیه تحقیق کلاسی یا پژوهشی با ساختار منظم، منابع قابل بررسی، و نگارش متناسب با خواسته استاد."
  },
  {
    icon: Presentation,
    title: "ارائه و پاورپوینت",
    body: "طراحی اسلاید دفاع، ارائه کلاسی یا ارائه پژوهشی با متن منسجم، ساختار روشن و فایل قابل تحویل."
  }
];

const requiredInputs = [
  "موضوع، ایده اولیه یا توضیح کاری که نیاز دارید",
  "نام دانشگاه، رشته، مقطع و شیوه‌نامه یا قالب دانشگاه",
  "منابع، مقالات، فایل داده، پروپوزال یا هر فایل آماده‌ای که دارید",
  "مهلت تحویل، زبان سفارش، روش یا رویکرد موردنظر استاد",
  "توضیحات استاد، اصلاحات قبلی، یا نکته‌هایی که باید رعایت شود"
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative min-h-[calc(100svh-64px)] overflow-hidden">
        <Image
          src="/images/thesis-hero.png"
          alt="میز کار دانشگاهی برای مدیریت سفارش خدمات پژوهشی"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-black/56 via-black/24 to-white/18" />
        <div className="relative mx-auto flex min-h-[calc(100svh-64px)] w-full max-w-7xl items-center px-4 pb-24 pt-16 lg:px-8">
          <div className="max-w-2xl text-white hero-text-shadow">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/35 bg-white/14 px-3 py-2 text-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              پایان‌نامه کارشناسی، ارشد، رساله، پروپوزال، تحقیق و ارائه
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl lg:text-6xl">
              خدمات دانشگاهی از ایده تا تحویل
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/92 sm:text-lg">
              دقیقاً مشخص کنید چه کاری می‌خواهید، فایل‌ها و توضیحات را ثبت کنید و بعد از تأیید مدیر، سفارش را تا تحویل نهایی پیگیری کنید.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/order">
                  ثبت سفارش
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/60 bg-white/12 text-white hover:bg-white/20">
                <Link href="/orders">سفارش‌های من</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="-mt-16 relative z-10 mx-auto grid w-full max-w-7xl gap-4 px-4 pb-10 lg:px-8">
        <div className="tool-surface grid gap-4 p-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step} className="flex items-start gap-3 rounded-md bg-white p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-50 text-sm font-bold text-teal-800">
                {index + 1}
              </span>
              <p className="text-sm font-medium leading-7">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 lg:px-8">
        <div>
          <h2 className="text-2xl font-semibold">چه کارهایی انجام می‌شود؟</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            این سامانه برای سفارش‌های دانشگاهی طراحی شده است؛ از کارهای پژوهشی بلندمدت تا تحقیق و ارائه کلاسی. قبل از شروع، سفارش توسط مدیر بررسی می‌شود تا محدوده کار، فایل‌های لازم و زمان تحویل روشن باشد.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <article key={service.title} className="tool-surface p-5">
                <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-base font-semibold">{service.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{service.body}</p>
              </article>
            );
          })}
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">روند کار شفاف است</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              از ثبت اولیه تا تأیید مدیر و تحویل خروجی، همه چیز در حساب کاربری شما قابل مشاهده است.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="tool-surface p-5">
                <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.body}</p>
              </article>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          سفارش پس از تأیید مدیر وارد مرحله انجام می‌شود و فایل نهایی پس از بازبینی در همین سامانه قرار می‌گیرد.
        </div>

        <section className="tool-surface grid gap-5 p-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-xl font-semibold">برای ثبت سفارش چه چیزهایی لازم است؟</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              هرچه اطلاعات اولیه دقیق‌تر باشد، بررسی مدیر سریع‌تر انجام می‌شود و سفارش با ابهام کمتری شروع می‌شود.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {requiredInputs.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-md border border-border bg-white p-3 text-sm leading-7">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
