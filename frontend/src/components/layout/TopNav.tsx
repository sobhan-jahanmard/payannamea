"use client";

import {
  ClipboardList,
  Home,
  LayoutDashboard,
  ListOrdered,
  LogIn,
  LogOut,
  Mail,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const { user, isAdmin, logout } = useAuth();
  const isCustomer = user && !isAdmin;
  const navItems = [
    { href: "/", label: "خانه", icon: Home },
    ...(!user || isCustomer
      ? [{ href: "/order", label: "ثبت سفارش", icon: ClipboardList }]
      : []),
    ...(isCustomer
      ? [{ href: "/orders", label: "سفارش‌های من", icon: ListOrdered }]
      : []),
    ...(isAdmin
      ? [{ href: "/admin", label: "مدیریت", icon: LayoutDashboard }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/92 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-semibold leading-5">خدمات دانشگاهی</p>
            <p className="text-xs text-muted-foreground">
              ثبت، انجام و پیگیری سفارش
            </p>
          </div>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = (() => {
              if (item.href === "/") return pathname === "/";
              // match exact or nested routes: /order and /order/123 but not /orders
              if (pathname === item.href) return true;
              if (pathname.startsWith(item.href + "/")) return true;
              // keep existing special-case: mark /status as active for Orders nav
              if (item.href === "/orders" && pathname.startsWith("/status"))
                return true;
              return false;
            })();
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                  isActive
                    ? "border-primary bg-teal-50 text-teal-900"
                    : "border-border bg-white text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {user ? (
            <>
              <div
                className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm"
                title={`${user.full_name} - ${user.email}`}
              >
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="hidden font-medium text-muted-foreground sm:inline">
                  {user.full_name}
                </span>
                <span className="ltr max-w-[220px] truncate text-left font-medium text-foreground">
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                title={user.full_name}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>خروج</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                  pathname.startsWith("/login")
                    ? "border-primary bg-teal-50 text-teal-900"
                    : "border-border bg-white text-foreground hover:bg-muted",
                )}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>ورود</span>
              </Link>
              <Link
                href="/register"
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                  pathname.startsWith("/register")
                    ? "border-primary bg-teal-50 text-teal-900"
                    : "border-border bg-white text-foreground hover:bg-muted",
                )}
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>ثبت‌نام</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
