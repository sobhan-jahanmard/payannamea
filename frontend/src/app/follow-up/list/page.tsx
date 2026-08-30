"use client";

import { ChevronLeft, ChevronRight, RefreshCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthGate, useAuth } from "../../../components/auth/AuthProvider";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { listNewFollowups, updatePhoneFollowup } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import type {
  NewFollowupsResponse,
  UserFollowupStatus,
} from "../../../types/api";

const statusLabels: Record<UserFollowupStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  closed: "بسته‌شده",
};

type Draft = { status: UserFollowupStatus; note: string };

function FollowupsListPanel() {
  const { canFollowUp } = useAuth();
  const [data, setData] = useState<NewFollowupsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const response = await listNewFollowups({ page: nextPage, limit: 50 });
      setData(response);
      setDrafts(
        Object.fromEntries(
          response.users.map((user) => [
            user.id,
            { status: user.admin_followup_status, note: user.admin_note ?? "" },
          ]),
        ),
      );
      setPage(nextPage);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "بارگذاری لیست ناموفق بود",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    try {
      await updatePhoneFollowup({
        id,
        admin_followup_status: draft.status,
        admin_note: draft.note,
      });
      // Re-read rather than mutating locally: a changed status is removed from this new-only list.
      await load(page);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "ذخیره پیگیری ناموفق بود",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (!canFollowUp) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-8">
        <section className="tool-surface p-6">دسترسی به لیست پیگیری‌ها ندارید.</section>
      </main>
    );
  }

  const users = data?.users ?? [];
  const canGoBack = page > 1;
  const canGoForward = data ? page < data.pagination.pages : false;

  return (
    <main className="mx-auto grid w-full max-w-9xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">لیست پیگیری‌ها</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فهرست موارد جدید گزارش پیگیری. پس از ذخیره، لیست به‌روز می‌شود.
          </p>
        </div>
        <Button type="button" onClick={() => void load(page)} loading={loading}>
          <RefreshCcw className="h-4 w-4" />
          تازه‌سازی
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="tool-surface overflow-x-auto p-5">
        <div className="mb-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>تعداد موارد جدید: {data?.pagination.total.toLocaleString("fa-IR") ?? "-"}</span>
          {loading ? <span>در حال بارگذاری...</span> : null}
        </div>
        <table className="w-full min-w-[1250px] text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="p-3">شماره موبایل</th>
              <th className="w-48 p-3">نام</th>
              <th className="p-3">منبع</th>
              <th className="p-3">زمان ثبت</th>
              <th className="p-3">سفارش‌ها</th>
              <th className="w-48 p-3">وضعیت پیگیری</th>
              <th className="w-80 p-3">یادداشت</th>
              <th className="p-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const draft = drafts[user.id] ?? {
                status: user.admin_followup_status,
                note: user.admin_note ?? "",
              };
              const isSaving = savingId === user.id;
              return (
                <tr key={user.id} className="border-b border-border/70 align-top">
                  <td className="ltr whitespace-nowrap p-3 text-left">{user.phone ?? "-"}</td>
                  <td className="p-3">{user.full_name ?? "بدون نام"}</td>
                  <td className="p-3">{user.is_verified ? "کاربر تأییدشده" : "درخواست مشاوره (تأییدنشده)"}</td>
                  <td className="whitespace-nowrap p-3">{formatDateTime(user.created_at)}</td>
                  <td className="p-3">{user.order_count.toLocaleString("fa-IR")}</td>
                  <td className="p-3">
                    <Select
                      value={draft.status}
                      disabled={isSaving}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, status: event.target.value as UserFollowupStatus },
                        }))
                      }
                    >
                      {(Object.keys(statusLabels) as UserFollowupStatus[]).map((status) => (
                        <option key={status} value={status}>{statusLabels[status]}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-3">
                    <Textarea
                      className="min-h-20 resize-y"
                      value={draft.note}
                      disabled={isSaving}
                      maxLength={2000}
                      placeholder="نتیجه تماس یا توضیحات پیگیری..."
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, note: event.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="p-3">
                    <Button type="button" size="sm" loading={isSaving} disabled={savingId !== null && !isSaving} onClick={() => void save(user.id)}>
                      <Save className="h-4 w-4" />
                      ذخیره
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!loading && users.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">مورد جدیدی برای پیگیری وجود ندارد.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {data && data.pagination.pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" disabled={!canGoBack || loading} onClick={() => void load(page - 1)}>
            <ChevronRight className="h-4 w-4" />
            قبلی
          </Button>
          <span className="text-sm text-muted-foreground">صفحه {page.toLocaleString("fa-IR")} از {data.pagination.pages.toLocaleString("fa-IR")}</span>
          <Button type="button" variant="outline" disabled={!canGoForward || loading} onClick={() => void load(page + 1)}>
            بعدی
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </main>
  );
}

export default function FollowupsListPage() {
  return <AuthGate><FollowupsListPanel /></AuthGate>;
}
