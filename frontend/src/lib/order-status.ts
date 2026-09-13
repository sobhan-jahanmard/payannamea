/** Single source of truth for every order status used by the UI and API. */
export const ORDER_STATUS_DEFINITIONS = {
  submitted: { label: "در انتظار تأیید مدیر", badgeClass: "border-sky-300 bg-sky-50 text-sky-800" },
  approved: { label: "تأیید شده", badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  in_progress: { label: "در حال انجام", badgeClass: "border-teal-300 bg-teal-50 text-teal-900" },
  sample_pending_customer_approval: { label: "نمونه آماده تأیید مشتری", badgeClass: "border-violet-300 bg-violet-50 text-violet-900" },
  approved_pending_for_final_execution: { label: "نمونه تأیید شد؛ آماده اجرای نهایی", badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  worker_done_pending_approval: { label: "انجام شده، در انتظار تأیید", badgeClass: "border-amber-300 bg-amber-50 text-amber-900" },
  admin_review: { label: "در انتظار بررسی مدیر", badgeClass: "border-amber-300 bg-amber-50 text-amber-900" },
  completed: { label: "انجام شده و تمام", badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  failed: { label: "ناموفق", badgeClass: "border-red-300 bg-red-50 text-red-800" }
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_DEFINITIONS;
export const ORDER_STATUSES = Object.keys(ORDER_STATUS_DEFINITIONS) as [OrderStatus, ...OrderStatus[]];
export const getOrderStatusDefinition = (status: OrderStatus) => ORDER_STATUS_DEFINITIONS[status];
