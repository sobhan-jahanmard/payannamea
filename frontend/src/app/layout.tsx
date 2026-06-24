import type { Metadata } from "next";

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
  return (
    <html lang="fa" dir="rtl">
      <body>
        <AuthProvider>
          <TopNav />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
