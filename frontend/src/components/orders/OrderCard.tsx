import { ArrowLeft, CalendarDays, Clock3, GraduationCap, Landmark, Phone, Trash2, UserRound } from "lucide-react";
import Link from "next/link";

import { formatDate, formatDateTime, paymentStatusLabel } from "../../lib/format";
import type { Order } from "../../types/api";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";

export function OrderCard({
  order,
  isAdmin,
  deleting = false,
  onDelete,
}: {
  order: Order;
  isAdmin: boolean;
  deleting?: boolean;
  onDelete: (orderId: string) => void;
}) {
  return (
    <article className="group relative min-w-0 rounded-xl border border-border bg-white transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-sm focus-within:border-primary/50">
      <div className="p-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Badge className="border-green-700 bg-green-700 text-white">
            {order.order_type || "سفارش دانشگاهی"}
          </Badge>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ثبت: <time dateTime={order.created_at}>{formatDateTime(order.created_at)}</time>
          </span>
        </div>
        <h2 className="text-base font-semibold leading-8">
          <Link
            href={
              isAdmin
                ? `/admin/orders/${encodeURIComponent(order.id)}`
                : `/status?order=${encodeURIComponent(order.id)}`
            }
            className="break-words after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
          >
            {order.title}
          </Link>
        </h2>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm leading-6">
          <div className="flex min-w-0 items-start gap-1.5">
            <dt className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <UserRound className="mt-1 h-4 w-4" aria-hidden="true" />
              دانشجو:
            </dt>
            <dd className="break-words font-medium">{order.student_name?.trim() || "ثبت نشده"}</dd>
          </div>
          <div className="flex min-w-0 items-start gap-1.5">
            <dt className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Phone className="mt-1 h-4 w-4" aria-hidden="true" />
              موبایل:
            </dt>
            <dd><bdi dir="ltr" className="tabular-nums">{order.customer?.phone || "ثبت نشده"}</bdi></dd>
          </div>
        </dl>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs leading-6 text-muted-foreground sm:text-sm">
          {order.degree ? (
            <div className="flex min-w-0 items-start gap-1.5">
              <dt className="inline-flex shrink-0 items-center gap-1.5">
                <GraduationCap className="mt-1 h-4 w-4" aria-hidden="true" />
                <span className="sr-only">مقطع:</span>
              </dt>
              <dd className="break-words">{order.degree}</dd>
            </div>
          ) : null}
          {order.university ? (
            <div className="flex min-w-0 items-start gap-1.5">
              <dt className="inline-flex shrink-0 items-center gap-1.5">
                <Landmark className="mt-1 h-4 w-4" aria-hidden="true" />
                <span className="sr-only">دانشگاه:</span>
              </dt>
              <dd className="break-words">{order.university}</dd>
            </div>
          ) : null}
          {order.deadline ? (
            <div className="flex items-start gap-1.5">
              <dt className="inline-flex shrink-0 items-center gap-1.5">
                <CalendarDays className="mt-1 h-4 w-4" aria-hidden="true" />
                مهلت:
              </dt>
              <dd><time dateTime={order.deadline}>{formatDate(order.deadline)}</time></dd>
            </div>
          ) : null}
        </dl>
        {isAdmin && order.created_by?.role === "operator" ? (
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            ثبت‌شده توسط اپراتور: {order.created_by.full_name ?? order.created_by.username ?? order.created_by.email ?? "بدون نام"}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-b-xl border-t border-border/60 bg-slate-50/70 px-4 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={order.status} />
          <span className="text-xs text-muted-foreground">
            <span className="sr-only">وضعیت پرداخت: </span>
            {paymentStatusLabel(order.payment_status)}
          </span>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary group-hover:underline" aria-hidden="true">
            مشاهده جزئیات
            <ArrowLeft className="h-4 w-4" />
          </span>
          {isAdmin ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative z-10 h-11 w-11 text-muted-foreground hover:bg-red-50 hover:text-red-700"
              aria-label={`حذف سفارش «${order.title}»`}
              title="حذف سفارش"
              onClick={() => onDelete(order.id)}
              loading={deleting}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
