import type { Metadata } from "next";
import Script from "next/script";

import { AnalyticsTracker } from "../components/analytics/AnalyticsTracker";
import { AuthProvider } from "../components/auth/AuthProvider";
import { TopNav } from "../components/layout/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "سامانه خدمات دانشگاهی",
  description: "ثبت، پیگیری و مدیریت سفارش پایان‌نامه، رساله، پروپوزال، تحقیق و ارائه",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cloudflareAnalyticsToken =
    process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN?.trim() ||
    "660524cdc1b44a0ba9860110a034ea4e";

  return (
    <html lang="fa" dir="rtl">
      <body>
        <AuthProvider>
          <AnalyticsTracker />
          <TopNav />
          {children}
        </AuthProvider>
        {process.env.NODE_ENV === "production" && cloudflareAnalyticsToken ? (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="afterInteractive"
            data-cf-beacon={JSON.stringify({ token: cloudflareAnalyticsToken, spa: true })}
          />
        ) : null}
      </body>
    </html>
  );
}
