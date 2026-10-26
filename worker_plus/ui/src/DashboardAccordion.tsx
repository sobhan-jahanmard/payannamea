import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./dashboard-accordion.css";

export function DashboardAccordion({ title, className = "", children }: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return <details className={`dashboard-accordion ${className}`} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="dashboard-accordion-summary"><span>{title}</span><ChevronDown size={18} aria-hidden="true"/></summary>
    <div className="dashboard-accordion-body">{children}</div>
  </details>;
}
