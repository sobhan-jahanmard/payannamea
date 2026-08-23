export type AnalyticsProperties = Record<string, string | number | boolean>;

type QueuedAnalyticsEvent = {
  visitor_id: string;
  session_id: string;
  event_name: string;
  path: string;
  properties: AnalyticsProperties;
};

const VISITOR_KEY = "payanname_analytics_visitor";
const SESSION_KEY = "payanname_analytics_session";
const UTM_SOURCE_KEY = "payanname_utm_source";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const queue: QueuedAnalyticsEvent[] = [];
let sending = false;
let memoryVisitorId: string | null = null;
let memorySessionId: string | null = null;
let memoryUtmSource: string | null = null;

/** Keeps the first campaign source for the current browser until it converts. */
export function captureUtmSource(): string | null {
  if (typeof window === "undefined") return null;
  const source = new URLSearchParams(window.location.search).get("utm_source")?.trim().slice(0, 100);
  try {
    const stored = window.localStorage.getItem(UTM_SOURCE_KEY)?.trim().slice(0, 100) || null;
    if (stored) {
      memoryUtmSource = stored;
      return stored;
    }
    if (source) {
      window.localStorage.setItem(UTM_SOURCE_KEY, source);
      memoryUtmSource = source;
      return source;
    }
  } catch {
    if (memoryUtmSource) return memoryUtmSource;
    if (source) memoryUtmSource = source;
  }
  return null;
}

export function clearCapturedUtmSource(): void {
  memoryUtmSource = null;
  try {
    window.localStorage.removeItem(UTM_SOURCE_KEY);
  } catch {
    // The in-memory value has already been cleared.
  }
}

function storedUuid(
  storage: Storage,
  key: string,
  memoryValue: string | null,
): string {
  try {
    const current = storage.getItem(key);
    if (current && /^[0-9a-f-]{36}$/i.test(current)) return current;
    const created = crypto.randomUUID();
    storage.setItem(key, created);
    return created;
  } catch {
    return memoryValue ?? crypto.randomUUID();
  }
}

function visitorId(): string {
  const value = storedUuid(window.localStorage, VISITOR_KEY, memoryVisitorId);
  memoryVisitorId = value;
  return value;
}

function sessionId(): string {
  const value = storedUuid(window.sessionStorage, SESSION_KEY, memorySessionId);
  memorySessionId = value;
  return value;
}

export function analyticsPageKey(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/admin/orders/")) return "admin_order_detail";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/uploads/")) return "upload";
  return (
    pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "_") || "home"
  );
}

export function pageViewProperties(): AnalyticsProperties {
  const params = new URLSearchParams(window.location.search);
  let referrerHost = "direct";
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname;
  } catch {
    // Keep the privacy-safe direct fallback for malformed referrers.
  }

  const width = window.innerWidth;
  return {
    referrer_host: referrerHost,
    device_type: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop",
    viewport_width: width,
    language: navigator.language.slice(0, 20),
    ...(params.get("utm_source")
      ? { utm_source: params.get("utm_source")!.slice(0, 100) }
      : {}),
    ...(params.get("utm_medium")
      ? { utm_medium: params.get("utm_medium")!.slice(0, 100) }
      : {}),
    ...(params.get("utm_campaign")
      ? { utm_campaign: params.get("utm_campaign")!.slice(0, 100) }
      : {}),
  };
}

export function flushAnalyticsEvents(): void {
  if (typeof window === "undefined" || sending || queue.length === 0) return;
  const event = queue.shift();
  if (!event) return;
  sending = true;
  let retryLater = false;

  void fetch(`${API_BASE_URL}/api/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok && response.status >= 500) {
        queue.unshift(event);
        retryLater = true;
      }
    })
    .catch(() => {
      queue.unshift(event);
      retryLater = true;
    })
    .finally(() => {
      sending = false;
      if (retryLater) {
        window.setTimeout(flushAnalyticsEvents, 5_000);
      } else if (queue.length > 0) {
        flushAnalyticsEvents();
      }
    });
}

export function trackAnalyticsEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === "undefined") return;
  queue.push({
    visitor_id: visitorId(),
    session_id: sessionId(),
    event_name: eventName,
    path: window.location.pathname.slice(0, 500),
    properties,
  });
  if (queue.length > 100) queue.shift();
  flushAnalyticsEvents();
}
