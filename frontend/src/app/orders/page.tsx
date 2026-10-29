"use client";

import { ClipboardList, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { OrderCard } from "../../components/orders/OrderCard";
import { Button } from "../../components/ui/button";
import { deleteOrder, listMyOrders } from "../../lib/api";
import type { Order } from "../../types/api";

function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        {orders.length ? (
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
