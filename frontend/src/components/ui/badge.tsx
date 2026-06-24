import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { statusLabel } from "../../lib/format";
import type { OrderStatus } from "../../types/api";

const statusStyles: Record<OrderStatus, string> = {
  submitted: "border-sky-300 bg-sky-50 text-sky-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-900",
  in_progress: "border-teal-300 bg-teal-50 text-teal-900",
  worker_done_pending_approval: "border-amber-300 bg-amber-50 text-amber-900",
  admin_review: "border-amber-300 bg-amber-50 text-amber-900",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-900",
  failed: "border-red-300 bg-red-50 text-red-800"
};

export function Badge({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={statusStyles[status]}>{statusLabel(status)}</Badge>;
}
