"use client";

import {
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Save,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AuthGate } from "../../../components/auth/AuthProvider";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { getAdminUsers, updateAdminUser } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import type {
  AdminUsersResponse,
  UserFollowupStatus,
} from "../../../types/api";

const statusLabels: Record<UserFollowupStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  closed: "بسته‌شده",
};

const roleLabels = {
  customer: "کاربر عادی",
  operator: "اپراتور",
  admin: "ادمین",
} as const;

function number(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("fa-IR");
}

function AdminUsersPanel() {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserFollowupStatus | "">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        full_name: string;
        email: string;
        admin_followup_status: UserFollowupStatus;
        admin_note: string;
      }
    >
  >({});
  const [error, setError] = useState<string | null>(null);

  async function load(
    nextPage = page,
    statusOverride?: UserFollowupStatus | "",
  ) {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminUsers({
        search: search.trim() || undefined,
        status: (statusOverride ?? status) || undefined,
        page: nextPage,
        limit: 50,
      });
      setData(response);
      setDrafts(
        Object.fromEntries(
          response.users.map((user) => [
            user.id,
            {
              full_name: user.full_name ?? "",
              email: user.email ?? "",
              admin_followup_status: user.admin_followup_status,
              admin_note: user.admin_note ?? "",
            },
          ]),
        ),
      );
      setPage(nextPage);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "بارگذاری کاربران ناموفق بود",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function saveUser(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAdminUser(id, draft);
      setData((current) =>
        current
          ? {
              ...current,
              users: current.users.map((user) =>
                user.id === id ? updated : user,
              ),
            }
          : current,
      );
      setDrafts((current) => ({
        ...current,
        [id]: {
          full_name: updated.full_name ?? "",
          email: updated.email ?? "",
          admin_followup_status: updated.admin_followup_status,
          admin_note: updated.admin_note ?? "",
        },
      }));
      void load(page);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "ذخیره تغییرات ناموفق بود",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-9xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">کاربران ثبت‌نام‌شده</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فهرست کاربران و وضعیت پیگیری آن‌ها توسط ادمین
          </p>
        </div>
        <Button type="button" onClick={() => void load(page)} loading={loading}>
          <RefreshCcw className="h-4 w-4" />
          تازه‌سازی
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(statusLabels) as UserFollowupStatus[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setStatus(key);
              void load(1, key);
            }}
            className="tool-surface p-4 text-right hover:bg-muted"
          >
            <p className="text-xs text-muted-foreground">{statusLabels[key]}</p>
            <p className="mt-2 text-2xl font-semibold">
              {number(data?.counts[key])}
            </p>
          </button>
        ))}
      </section>

      <section className="tool-surface grid gap-4 p-5 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <div className="space-y-2">
          <Label>جست‌وجوی کاربر یا یادداشت</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(1);
            }}
            placeholder="نام، ایمیل، شماره موبایل یا یادداشت..."
          />
        </div>
        <div className="space-y-2">
          <Label>وضعیت</Label>
          <Select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as UserFollowupStatus | "")
            }
          >
            <option value="">همه وضعیت‌ها</option>
            {(Object.keys(statusLabels) as UserFollowupStatus[]).map((key) => (
              <option key={key} value={key}>
                {statusLabels[key]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" onClick={() => void load(1)} loading={loading}>
          <Search className="h-4 w-4" />
          جست‌وجو
        </Button>
      </section>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="tool-surface overflow-x-auto p-5">
        <table className="w-full min-w-[1400px] text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="w-56 p-3">نام</th>
              <th className="p-3">نقش</th>
              <th className="p-3">شماره موبایل</th>
              <th className="w-64 p-3">ایمیل</th>
              <th className="p-3">تاریخ ثبت‌نام</th>
              <th className="p-3">سفارش‌ها</th>
              <th className="w-48 p-3">وضعیت پیگیری</th>
              <th className="w-80 p-3">یادداشت ادمین</th>
              <th className="p-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => {
              const draft = drafts[user.id] ?? {
                full_name: user.full_name ?? "",
                email: user.email ?? "",
                admin_followup_status: user.admin_followup_status,
                admin_note: user.admin_note ?? "",
              };
              const isSaving = updatingId === user.id;
              const canEditIdentity = user.role === "customer";
              return (
                <tr
                  key={user.id}
                  className="border-b border-border/70 align-top"
                >
                  <td className="p-3">
                    <Input
                      value={draft.full_name}
                      disabled={isSaving || !canEditIdentity}
                      maxLength={255}
                      placeholder="بدون نام"
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, full_name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {roleLabels[user.role]}
                  </td>
                  <td className="ltr p-3 text-left">{user.phone || "-"}</td>
                  <td className="p-3">
                    <Input
                      className="ltr text-left"
                      value={draft.email}
                      disabled={isSaving || !canEditIdentity}
                      maxLength={255}
                      placeholder="-"
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, email: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {formatDateTime(user.created_at)}
                  </td>
                  <td className="p-3">{number(user.order_count)}</td>
                  <td className="p-3">
                    <Select
                      value={draft.admin_followup_status}
                      disabled={isSaving}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: {
                            ...draft,
                            admin_followup_status: e.target
                              .value as UserFollowupStatus,
                          },
                        }))
                      }
                    >
                      {(Object.keys(statusLabels) as UserFollowupStatus[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {statusLabels[key]}
                          </option>
                        ),
                      )}
                    </Select>
                  </td>
                  <td className="p-3">
                    <Textarea
                      className="min-h-20 resize-y"
                      value={draft.admin_note}
                      maxLength={2000}
                      disabled={isSaving}
                      placeholder="نتیجه تماس یا توضیحات پیگیری..."
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: { ...draft, admin_note: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="p-3">
                    <Button
                      type="button"
                      size="sm"
                      loading={isSaving}
                      disabled={updatingId !== null && !isSaving}
                      onClick={() => void saveUser(user.id)}
                    >
                      <Save className="h-4 w-4" />
                      ذخیره
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data?.users.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            کاربری پیدا نشد.
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
          >
            <ChevronRight className="h-4 w-4" />
            قبلی
          </Button>
          <span className="text-sm">
            صفحه {number(page)} از {number(data?.pagination.pages)}
          </span>
          <Button
            variant="outline"
            disabled={!data || page >= data.pagination.pages || loading}
            onClick={() => void load(page + 1)}
          >
            بعدی
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <AuthGate adminOnly>
      <AdminUsersPanel />
    </AuthGate>
  );
}
