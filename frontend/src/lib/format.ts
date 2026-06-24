import type { OrderStatus } from "../types/api";

export const orderStatuses: OrderStatus[] = [
  "submitted",
  "approved",
  "in_progress",
  "worker_done_pending_approval",
  "admin_review",
  "completed",
  "failed"
];

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
  const labels: Record<OrderStatus, string> = {
    submitted: "در انتظار تأیید مدیر",
    approved: "تأیید شده",
    in_progress: "در حال انجام",
    worker_done_pending_approval: "انجام شده، در انتظار تأیید",
    admin_review: "در انتظار بررسی مدیر",
    completed: "انجام شده و تمام",
    failed: "ناموفق"
  };
  return labels[status];
}
