"use client";

import { ChevronLeft, ChevronRight, ClipboardList, RefreshCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { OrderCard } from "../../components/orders/OrderCard";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { deleteOrder, listMyOrders } from "../../lib/api";
import type { OrdersListResponse } from "../../types/api";

function OrdersList() {
  const { user } = useAuth();
  const [data, setData] = useState<OrdersListResponse | null>(null);
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedSearch = search.trim();
  const orders = data?.orders ?? [];
  const pagination = data?.pagination;

  useEffect(() => {
    if (trimmedSearch === query.search) return;
    const timer = window.setTimeout(() => {
      setQuery({ search: trimmedSearch, page: 1 });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [trimmedSearch, query.search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    // Cancel the previous request as soon as typing starts, and wait for
    // debounce before requesting page one of the new search.
    if (trimmedSearch !== query.search) return () => controller.abort();
    setError(null);
    void listMyOrders({ ...query, limit: 20 }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "بارگذاری سفارش‌ها ناموفق بود");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, trimmedSearch, refreshKey]);

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
      setRefreshKey((current) => current + 1);
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
            onClick={() => setRefreshKey((current) => current + 1)}
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
                maxLength={120}
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
            {loading || trimmedSearch !== query.search
              ? "در حال بارگذاری سفارش‌ها..."
              : error && !data
                ? "بارگذاری سفارش‌ها ناموفق بود."
                : `${(pagination?.total ?? 0).toLocaleString("fa-IR")} ${query.search ? "نتیجه" : "سفارش"}`}
          </p>
        </div>
        <div id="orders-results" aria-busy={loading || trimmedSearch !== query.search}>
          {loading || trimmedSearch !== query.search ? (
            <p className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری سفارش‌ها...</p>
          ) : orders.length ? (
            <div className="grid gap-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isAdmin={user?.role === "admin"}
                  deleting={deletingOrderId === order.id}
                  onDelete={(orderId) => void removeOrder(orderId)}
                />
              ))}
            </div>
          ) : error ? null : query.search ? (
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
        {pagination && pagination.total > 0 && !error ? (
          <nav aria-label="صفحه‌بندی سفارش‌ها" className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-6 text-muted-foreground">
              نمایش {((pagination.page - 1) * pagination.limit + 1).toLocaleString("fa-IR")} تا {Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString("fa-IR")} از {pagination.total.toLocaleString("fa-IR")}
            </p>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={loading || trimmedSearch !== query.search || Boolean(deletingOrderId) || pagination.page <= 1}
                onClick={() => setQuery((current) => ({ ...current, page: pagination.page - 1 }))}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحه {pagination.page.toLocaleString("fa-IR")} از {pagination.pages.toLocaleString("fa-IR")}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={loading || trimmedSearch !== query.search || Boolean(deletingOrderId) || pagination.page >= pagination.pages}
                onClick={() => setQuery((current) => ({ ...current, page: pagination.page + 1 }))}
              >
                بعدی
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        ) : null}
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
