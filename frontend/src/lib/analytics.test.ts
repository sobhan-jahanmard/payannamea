import assert from "node:assert/strict";
import { test } from "node:test";
import { flushAnalyticsEvents, trackAnalyticsEvent } from "./analytics";

test("browser excludes staff and discards queued visitor events on staff login", async (t) => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value)
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "daneshyar.example", pathname: "/" },
      localStorage: storage(local),
      sessionStorage: storage(session),
      setTimeout() { return 1; }
    }
  });
  const sent: string[] = [];
  let fail = false;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).event_name);
    return new Response(null, { status: fail ? 503 : 202 });
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    for (const role of ["admin", "operator"]) {
      local.set("payanname_auth_token", "staff-session");
      local.set("payanname_auth_user", JSON.stringify({ role }));
      trackAnalyticsEvent("staff_page_view");
      flushAnalyticsEvents();
    }
    assert.deepEqual(sent, []);

    local.clear();
    trackAnalyticsEvent("guest_page_view");
    await settle();
    local.set("payanname_auth_token", "customer-session");
    local.set("payanname_auth_user", JSON.stringify({ role: "customer" }));
    trackAnalyticsEvent("customer_page_view");
    await settle();
    assert.deepEqual(sent, ["guest_page_view", "customer_page_view"]);

    local.clear();
    fail = true;
    trackAnalyticsEvent("failed_before_login");
    trackAnalyticsEvent("queued_before_login");
    await settle();
    local.set("payanname_auth_token", "staff-session");
    local.set("payanname_auth_user", JSON.stringify({ role: "admin" }));
    flushAnalyticsEvents();
    local.clear();
    fail = false;
    trackAnalyticsEvent("guest_after_logout");
    await settle();
    assert.deepEqual(sent, ["guest_page_view", "customer_page_view", "failed_before_login", "guest_after_logout"]);
  } finally {
    flushAnalyticsEvents();
    fetchMock.mock.restore();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
