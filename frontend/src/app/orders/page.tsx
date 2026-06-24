"use client";

import { ClipboardList, ExternalLink, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { StatusBadge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { listMyOrders } from "../../lib/api";
import { formatDate, formatDateTime, statusLabel } from "../../lib/format";
import type { Order } from "../../types/api";

function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listMyOrders());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری سفارش‌ها ناموفق بود");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">سفارش‌های من</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.full_name}، همه سفارش‌های ثبت‌شده شما در همین صفحه دیده می‌شود.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void loadOrders()} loading={loading}>
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

      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}

      <section className="tool-surface p-5">
        {orders.length ? (
          <div className="grid gap-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/status?order=${encodeURIComponent(order.id)}`}
                className="grid gap-3 rounded-md border border-border bg-white p-4 transition hover:bg-muted lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-muted-foreground">{statusLabel(order.status)}</span>
                  </div>
                  <h2 className="line-clamp-2 text-base font-semibold">{order.title}</h2>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                    <span>{order.order_type ?? "سفارش دانشگاهی"}</span>
                    <span>{order.degree}</span>
                    <span>{order.university}</span>
                    <span>مهلت: {formatDate(order.deadline)}</span>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3 lg:flex-col lg:items-end">
                  <span className="text-sm text-muted-foreground">{formatDateTime(order.created_at)}</span>
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                    مشاهده
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
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
