"use client";

import { ExternalLink, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AuthGate } from "../../components/auth/AuthProvider";
import { StatusBadge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { listAdminOrders } from "../../lib/api";
import { formatDateTime, orderStatuses, statusLabel } from "../../lib/format";
import type { Order, OrderStatus } from "../../types/api";

function AdminPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    return orders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [orders]);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listAdminOrders(statusFilter || undefined));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری سفارش‌ها ناموفق بود");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">مدیریت سفارش‌ها</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فهرست سفارش‌ها، فیلتر وضعیت و باز کردن جزئیات هر سفارش در تب جداگانه
          </p>
        </div>
        <Button type="button" onClick={() => void loadOrders()} loading={loading}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          تازه‌سازی
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}

      <section className="tool-surface p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
          <div>
            <h2 className="text-lg font-semibold">فهرست سفارش‌ها</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(counts).map(([status, count]) => (
                <span key={status} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {statusLabel(status as OrderStatus)}: {count.toLocaleString("fa-IR")}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>فیلتر وضعیت</Label>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">همه سفارش‌ها</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          {orders.map((order) => (
            <a
              key={order.id}
              href={`/admin/orders/${encodeURIComponent(order.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="grid gap-2 rounded-md border border-border bg-white p-3 text-right transition hover:border-primary hover:bg-teal-50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 text-sm font-semibold">{order.title}</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <span>{order.order_type ?? "نوع سفارش ثبت نشده"}</span>
                <span className="ltr text-left">{order.customer.email}</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  باز کردن جزئیات
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span>{formatDateTime(order.created_at)}</span>
              </div>
            </a>
          ))}
          {orders.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
              سفارشی برای نمایش وجود ندارد.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function AdminPage() {
  return (
    <AuthGate adminOnly>
      <AdminPanel />
    </AuthGate>
  );
}
