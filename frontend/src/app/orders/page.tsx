"use client";

import { ClipboardList, RefreshCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { OrderCard } from "../../components/orders/OrderCard";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { deleteOrder, listMyOrders } from "../../lib/api";
import type { Order } from "../../types/api";

function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\s\u200c\u200d()+-]/g, "")
    .toLowerCase();
}

function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = normalizeSearch(search);
  const filteredOrders = orders.filter((order) =>
    normalizeSearch(order.student_name ?? "").includes(query) ||
    normalizeSearch(order.customer?.phone ?? "").includes(query),
  );

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listMyOrders());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "بارگذاری سفارش‌ها ناموفق بود",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  async function removeOrder(orderId: string) {
    if (
      !window.confirm(
        "این سفارش و اطلاعات وابسته به آن حذف شود؟ این عملیات قابل بازگشت نیست.",
      )
    )
      return;
    setDeletingOrderId(orderId);
    setError(null);
    try {
      await deleteOrder(orderId);
      setOrders((current) => current.filter((order) => order.id !== orderId));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "حذف سفارش ناموفق بود",
      );
    } finally {
      setDeletingOrderId(null);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {user?.role === "admin"
              ? "همه سفارش‌ها"
              : user?.role === "customer"
                ? "سفارش‌های من"
                : "سفارش‌های ثبت‌شده توسط من"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.role === "admin" ? (
              "همه سفارش‌های ثبت‌شده در سایت در این صفحه دیده می‌شوند."
            ) : user?.role === "customer" ? (
              <>
                همه سفارش‌های ثبت‌شده با شماره{" "}
                <span className="ltr inline-block">{user.phone}</span> در این
                صفحه دیده می‌شود.
              </>
            ) : (
              "در این صفحه فقط سفارش‌هایی را می‌بینید که خودتان برای مشتریان ثبت کرده‌اید."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadOrders()}
            loading={loading}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            تازه‌سازی
          </Button>
          <Button asChild>
            <Link href="/order">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              ثبت سفارش جدید
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}

      <section className="tool-surface p-3 sm:p-5" aria-label="فهرست سفارش‌ها">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <form role="search" className="w-full sm:max-w-md" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="student-search" className="mb-2 block text-sm font-medium">
              جست‌وجوی دانشجو
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={searchInputRef}
                id="student-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="نام یا شماره موبایل دانشجو"
                autoComplete="off"
                className="h-12 pl-12 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
                aria-controls="orders-results"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-0.5 top-1/2 h-11 w-11 -translate-y-1/2"
                  aria-label="پاک کردن جست‌وجو"
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </form>
          <p className="text-xs leading-6 text-muted-foreground" role="status">
            {loading
              ? "در حال بارگذاری سفارش‌ها..."
              : error && !orders.length
                ? "بارگذاری سفارش‌ها ناموفق بود."
                : query
                  ? `${filteredOrders.length.toLocaleString("fa-IR")} نتیجه از ${orders.length.toLocaleString("fa-IR")} سفارش`
                  : `${orders.length.toLocaleString("fa-IR")} سفارش`}
          </p>
        </div>
        <div id="orders-results" aria-busy={loading}>
          {filteredOrders.length ? (
            <div className="grid gap-3">
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isAdmin={user?.role === "admin"}
                  deleting={deletingOrderId === order.id}
                  onDelete={(orderId) => void removeOrder(orderId)}
                />
              ))}
            </div>
          ) : loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری سفارش‌ها...</p>
          ) : error && !orders.length ? null : query ? (
            <div className="grid justify-items-center gap-3 rounded-md border border-dashed border-border bg-white p-6 text-center">
              <Search className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">سفارشی با این نام یا شماره موبایل پیدا نشد.</p>
              <p className="text-xs leading-6 text-muted-foreground">بخشی از نام یا شماره را وارد کنید یا جست‌وجو را پاک کنید.</p>
              <Button type="button" variant="outline" onClick={() => setSearch("")}>
                پاک کردن جست‌وجو
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 rounded-md border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
              <p>هنوز سفارشی ثبت نکرده‌اید.</p>
              <Button asChild>
                <Link href="/order">
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  ثبت اولین سفارش
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function OrdersPage() {
  return (
    <AuthGate>
      <OrdersList />
    </AuthGate>
  );
}
