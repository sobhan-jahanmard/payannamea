import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { statusLabel } from "../../lib/format";
import { getOrderStatusDefinition } from "../../lib/order-status";
import type { OrderStatus } from "../../types/api";

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
  return <Badge className={getOrderStatusDefinition(status).badgeClass}>{statusLabel(status)}</Badge>;
}
