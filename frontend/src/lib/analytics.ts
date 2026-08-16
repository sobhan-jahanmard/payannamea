export type AnalyticsProperties = Record<string, string | number | boolean>;

type QueuedAnalyticsEvent = {
  name: string;
  properties: AnalyticsProperties;
};

declare global {
  interface Window {
    zaraz?: {
      track: (name: string, properties?: AnalyticsProperties) => Promise<unknown>;
    };
    __zarazEventQueue?: QueuedAnalyticsEvent[];
  }
}

export function analyticsPageKey(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/admin/orders/")) return "admin_order_detail";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/uploads/")) return "upload";
  return pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_") || "home";
}

export function flushAnalyticsEvents(): void {
  if (typeof window === "undefined" || !window.zaraz?.track) return;
  const queue = window.__zarazEventQueue?.splice(0) ?? [];
  for (const event of queue) {
    void window.zaraz.track(event.name, event.properties).catch(() => undefined);
  }
}

export function trackAnalyticsEvent(
  name: string,
  properties: AnalyticsProperties = {}
): void {
  if (typeof window === "undefined") return;

  const event = {
    name,
    properties: {
      ...properties,
      page_path: window.location.pathname
    }
  };
  if (window.zaraz?.track) {
    void window.zaraz.track(event.name, event.properties).catch(() => undefined);
    return;
  }

  const queue = (window.__zarazEventQueue ??= []);
  queue.push(event);
  if (queue.length > 50) queue.shift();
}
