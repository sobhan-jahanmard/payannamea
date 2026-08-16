"use client";

import { BarChart3, ChevronLeft, ChevronRight, RefreshCcw, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AuthGate } from "../../../components/auth/AuthProvider";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { getAdminAnalytics } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import type { AnalyticsDashboard } from "../../../types/api";

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function number(value: number | undefined): string {
  return Number(value ?? 0).toLocaleString("fa-IR");
}

function duration(seconds: number | undefined): string {
  const value = Number(seconds ?? 0);
  if (value < 60) return `${number(Math.round(value))} ثانیه`;
  return `${number(Math.round(value / 6) / 10)} دقیقه`;
}

function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1_000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [event, setEvent] = useState("");
  const [path, setPath] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page, overrides?: { event?: string; path?: string }) {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminAnalytics({
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
        event: (overrides?.event ?? event).trim() || undefined,
        path: (overrides?.path ?? path).trim() || undefined,
        search: search.trim() || undefined,
        page: nextPage,
        limit: 50
      }));
      setPage(nextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری آمار ناموفق بود");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const maxDailyViews = useMemo(
    () => Math.max(1, ...(data?.daily.map((item) => Number(item.events)) ?? [1])),
    [data]
  );

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">آمار رفتار کاربران</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بازدید صفحات، کاربران ناشناس، زمان تعامل، کلیک‌ها و مسیر ثبت سفارش
          </p>
        </div>
        <Button type="button" onClick={() => void load(page)} loading={loading}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          تازه‌سازی
        </Button>
      </div>

      <section className="tool-surface grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
        <Filter label="از تاریخ"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Filter>
        <Filter label="تا تاریخ"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Filter>
        <Filter label="نام رویداد"><Input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="مثلاً order_created" /></Filter>
        <Filter label="مسیر صفحه"><Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="مثلاً /order" /></Filter>
        <div className="flex items-end">
          <Button className="w-full" type="button" onClick={() => void load(1)} loading={loading}>
            <Search className="h-4 w-4" aria-hidden="true" /> اعمال فیلتر
          </Button>
        </div>
        <div className="md:col-span-2 xl:col-span-5">
          <Filter label="جست‌وجو در رویداد، مسیر، شناسه ناشناس و مشخصات">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(1); }} placeholder="عبارت موردنظر را وارد کنید" />
          </Filter>
        </div>
      </section>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="بازدید صفحه" value={number(data?.summary.page_views)} />
        <Metric label="بازدیدکننده ناشناس" value={number(data?.summary.unique_visitors)} />
        <Metric label="نشست" value={number(data?.summary.sessions)} />
        <Metric label="کل رویدادها" value={number(data?.summary.total_events)} />
        <Metric label="میانگین زمان فعال" value={duration(data?.summary.avg_engaged_seconds)} />
      </section>

      <section className="tool-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5" /> فعالیت روزانه</h2>
        <div className="grid min-h-44 grid-flow-col items-end gap-2 overflow-x-auto pb-2">
          {data?.daily.map((item) => (
            <div key={item.date} className="flex min-w-12 flex-col items-center gap-2" title={`${item.date}: ${item.events} رویداد، ${item.page_views} بازدید صفحه`}>
              <span className="text-xs font-medium">{number(item.events)}</span>
              <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(4, (Number(item.events) / maxDailyViews) * 120)}px` }} />
              <span className="ltr text-[10px] text-muted-foreground">{item.date.slice(5)}</span>
            </div>
          ))}
          {!data?.daily.length ? <p className="text-sm text-muted-foreground">داده‌ای در این بازه وجود ندارد.</p> : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ranking title="صفحات پربازدید" items={(data?.top_pages ?? []).map((item) => ({ key: item.path, primary: item.path, secondary: `${number(item.visitors)} بازدیدکننده`, count: item.views, onClick: () => { setPath(item.path); void load(1, { path: item.path }); } }))} />
        <Ranking title="رویدادهای پرتکرار" items={(data?.top_events ?? []).map((item) => ({ key: item.event_name, primary: item.event_name, secondary: `${number(item.visitors)} بازدیدکننده`, count: item.count, onClick: () => { setEvent(item.event_name); void load(1, { event: item.event_name }); } }))} />
      </div>

      <section className="tool-surface p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">رویدادهای ثبت‌شده</h2>
            <p className="mt-1 text-xs text-muted-foreground">{number(data?.pagination.total)} نتیجه</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" disabled={!data || page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronRight className="h-4 w-4" /> قبلی</Button>
            <span className="text-sm">صفحه {number(page)} از {number(data?.pagination.pages)}</span>
            <Button variant="outline" type="button" disabled={!data || page >= data.pagination.pages || loading} onClick={() => void load(page + 1)}>بعدی <ChevronLeft className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="p-3">زمان</th><th className="p-3">رویداد</th><th className="p-3">مسیر</th><th className="p-3">بازدیدکننده</th><th className="p-3">مشخصات</th></tr></thead>
            <tbody>
              {data?.events.map((item) => (
                <tr key={item.id} className="border-b border-border/70 align-top">
                  <td className="whitespace-nowrap p-3">{formatDateTime(item.created_at)}</td>
                  <td className="ltr p-3 text-left font-medium text-primary">{item.event_name}</td>
                  <td className="ltr p-3 text-left">{item.path}</td>
                  <td className="ltr p-3 text-left text-xs text-muted-foreground" title={item.visitor_id}>{item.visitor_id.slice(0, 8)}</td>
                  <td className="ltr max-w-sm break-words p-3 text-left text-xs text-muted-foreground">{Object.keys(item.properties).length ? JSON.stringify(item.properties) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="tool-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function Ranking({ title, items }: { title: string; items: Array<{ key: string; primary: string; secondary: string; count: number; onClick: () => void }> }) {
  return (
    <section className="tool-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5" />{title}</h2>
      <div className="grid gap-2">
        {items.map((item) => <button key={item.key} type="button" onClick={item.onClick} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white p-3 text-right hover:bg-muted"><span className="min-w-0"><span className="ltr block truncate text-left text-sm font-medium">{item.primary}</span><span className="block text-xs text-muted-foreground">{item.secondary}</span></span><span className="font-semibold">{number(item.count)}</span></button>)}
        {!items.length ? <p className="text-sm text-muted-foreground">داده‌ای وجود ندارد.</p> : null}
      </div>
    </section>
  );
}

export default function AdminAnalyticsPage() {
  return <AuthGate adminOnly><AnalyticsPanel /></AuthGate>;
}
