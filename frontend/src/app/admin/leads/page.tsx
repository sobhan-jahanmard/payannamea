"use client";

import { ChevronLeft, ChevronRight, RefreshCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthGate } from "../../../components/auth/AuthProvider";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { getAdminConsultationLeads, updateConsultationLeadStatus } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import type { ConsultationLeadStatus, ConsultationLeadsResponse } from "../../../types/api";

const statusLabels: Record<ConsultationLeadStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  closed: "بسته‌شده"
};

function number(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("fa-IR");
}

function LeadsPanel() {
  const [data, setData] = useState<ConsultationLeadsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ConsultationLeadStatus | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page, statusOverride?: ConsultationLeadStatus | "") {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminConsultationLeads({
        search: search.trim() || undefined,
        status: (statusOverride ?? status) || undefined,
        page: nextPage,
        limit: 50
      }));
      setPage(nextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری درخواست‌ها ناموفق بود");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(1); }, []);

  async function changeStatus(id: string, nextStatus: ConsultationLeadStatus) {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateConsultationLeadStatus(id, nextStatus);
      setData((current) => current ? {
        ...current,
        leads: current.leads.map((lead) => lead.id === id ? updated : lead)
      } : current);
      void load(page);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "به‌روزرسانی وضعیت ناموفق بود");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">درخواست‌های مشاوره رایگان</h1>
          <p className="mt-1 text-sm text-muted-foreground">لیدهای ثبت‌شده از فرم صفحه اصلی و وضعیت پیگیری آن‌ها</p>
        </div>
        <Button type="button" onClick={() => void load(page)} loading={loading}><RefreshCcw className="h-4 w-4" />تازه‌سازی</Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(statusLabels) as ConsultationLeadStatus[]).map((key) => (
          <button key={key} type="button" onClick={() => { setStatus(key); void load(1, key); }} className="tool-surface p-4 text-right hover:bg-muted">
            <p className="text-xs text-muted-foreground">{statusLabels[key]}</p>
            <p className="mt-2 text-2xl font-semibold">{number(data?.counts[key])}</p>
          </button>
        ))}
      </section>

      <section className="tool-surface grid gap-4 p-5 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <div className="space-y-2"><Label>جست‌وجوی شماره موبایل</Label><Input className="ltr text-left" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(1); }} placeholder="0912..." /></div>
        <div className="space-y-2"><Label>وضعیت</Label><Select value={status} onChange={(e) => setStatus(e.target.value as ConsultationLeadStatus | "")}><option value="">همه وضعیت‌ها</option>{(Object.keys(statusLabels) as ConsultationLeadStatus[]).map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}</Select></div>
        <Button type="button" onClick={() => void load(1)} loading={loading}><Search className="h-4 w-4" />جست‌وجو</Button>
      </section>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="tool-surface overflow-x-auto p-5">
        <table className="w-full min-w-[800px] text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="p-3">شماره موبایل</th><th className="p-3">اولین درخواست</th><th className="p-3">آخرین درخواست</th><th className="p-3">تعداد درخواست</th><th className="p-3">وضعیت پیگیری</th></tr></thead>
          <tbody>{data?.leads.map((lead) => <tr key={lead.id} className="border-b border-border/70"><td className="ltr p-3 text-left font-medium">{lead.phone}</td><td className="p-3">{formatDateTime(lead.created_at)}</td><td className="p-3">{formatDateTime(lead.last_requested_at)}</td><td className="p-3">{number(lead.request_count)}</td><td className="p-3"><Select value={lead.status} disabled={updatingId === lead.id} onChange={(e) => void changeStatus(lead.id, e.target.value as ConsultationLeadStatus)}>{(Object.keys(statusLabels) as ConsultationLeadStatus[]).map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}</Select></td></tr>)}</tbody>
        </table>
        {!data?.leads.length ? <p className="p-6 text-center text-sm text-muted-foreground">درخواستی پیدا نشد.</p> : null}
        <div className="mt-4 flex items-center justify-end gap-2"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronRight className="h-4 w-4" />قبلی</Button><span className="text-sm">صفحه {number(page)} از {number(data?.pagination.pages)}</span><Button variant="outline" disabled={!data || page >= data.pagination.pages || loading} onClick={() => void load(page + 1)}>بعدی<ChevronLeft className="h-4 w-4" /></Button></div>
      </section>
    </main>
  );
}

export default function AdminLeadsPage() {
  return <AuthGate adminOnly><LeadsPanel /></AuthGate>;
}
