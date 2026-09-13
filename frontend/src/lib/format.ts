import type { OrderStatus, PaymentStatus } from "../types/api";
import { ORDER_STATUSES, getOrderStatusDefinition } from "./order-status";

export const orderStatuses: OrderStatus[] = ORDER_STATUSES;

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran"
  }).format(new Date(value));
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    dateStyle: "medium",
    timeZone: "Asia/Tehran"
  }).format(new Date(value));
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function statusLabel(status: OrderStatus): string {
  return getOrderStatusDefinition(status).label;
}

export const paymentStatuses: PaymentStatus[] = ["fully_paid", "partially_paid", "not_paid", "refunded"];

export function paymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    fully_paid: "پرداخت کامل",
    partially_paid: "پرداخت بخشی",
    not_paid: "پرداخت نشده",
    refunded: "برگشت داده شده"
  };
  return labels[status];
}
