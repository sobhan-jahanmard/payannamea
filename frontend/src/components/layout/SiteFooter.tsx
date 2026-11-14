import Image from "next/image";
import { ArrowUpLeft, Instagram, Mail, MessageCircle, Send } from "lucide-react";

const contactLinks = [
  {
    label: "پشتیبانی تلگرام",
    handle: "@daneshyar_academic",
    href: "https://t.me/daneshyar_academic",
    icon: MessageCircle,
  },
  {
    label: "کانال نمونه‌کارها",
    handle: "@daneshyar_samples",
    href: "https://t.me/daneshyar_samples",
    icon: Send,
  },
  {
    label: "اینستاگرام",
    handle: "@daneshyar.web",
    href: "https://www.instagram.com/daneshyar.web/",
    icon: Instagram,
  },
  {
    label: "ایمیل",
    handle: "admin.daneshyar@gmail.com",
    href: "mailto:admin.daneshyar@gmail.com",
    icon: Mail,
  },
];

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-border bg-teal-50 text-teal-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/images/daneshyar-logo.png"
                alt="لوگوی دانشیار"
                width={48}
                height={48}
                className="h-12 w-12 rounded-lg bg-white object-contain p-1"
              />
              <div>
                <p className="text-lg font-bold">دانشیار</p>
                <p className="text-sm text-teal-800">همراه مسیر دانشگاهی شما</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-7 text-teal-800">
              برای پرسش درباره خدمات و پیگیری سفارش با ما در ارتباط باشید و
              نمونه‌کارها را در شبکه‌های اجتماعی دانشیار ببینید.
            </p>
          </div>

          <section aria-labelledby="footer-contact-heading" className="min-w-0">
            <h2 id="footer-contact-heading" className="text-lg font-bold">
              تماس با ما
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {contactLinks.map(({ label, handle, href, icon: Icon }) => (
                <li key={href} className="min-w-0">
                  <a
                    href={href}
                    target={href.startsWith("https://") ? "_blank" : undefined}
                    rel={href.startsWith("https://") ? "noopener noreferrer" : undefined}
                    className="group flex h-full min-h-20 items-center gap-3 rounded-lg border border-teal-200 bg-white/80 p-4 transition hover:border-teal-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-100 text-teal-800">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{label}</span>
                      <bdi dir="ltr" className="mt-1 block break-all text-left text-sm leading-6 text-teal-800">
                        {handle}
                      </bdi>
                    </span>
                    <ArrowUpLeft className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-8 border-t border-teal-200 pt-5 text-sm leading-7 text-teal-800">
          ارتباط و هماهنگی سفارش‌ها از طریق تلگرامِ شماره ثبت‌شده خواهد بود؛ لطفاً
          با شماره‌ای ثبت‌نام کنید که در تلگرام فعال است.
        </p>
      </div>
    </footer>
  );
}
