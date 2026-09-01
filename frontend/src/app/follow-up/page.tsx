"use client";

import { RefreshCcw, Save, Search } from "lucide-react";
import { useState } from "react";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { findPhoneFollowup, updatePhoneFollowup } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type {
  PhoneFollowupResponse,
  UserFollowupStatus,
} from "../../types/api";

const statusLabels: Record<UserFollowupStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  closed: "بسته‌شده",
};

function FollowUpPanel() {
  const { canFollowUp } = useAuth();
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<PhoneFollowupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<{
    status: UserFollowupStatus;
    note: string;
  } | null>(null);

  async function search() {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await findPhoneFollowup(phone.trim());
      setData(result);
      setUserDraft(
        result.user
          ? {
              status: result.user.admin_followup_status,
              note: result.user.admin_note ?? "",
            }
          : null,
      );
    } catch (searchError) {
      setData(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "جست‌وجوی شماره ناموفق بود",
      );
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const draft = userDraft;
    const record = data?.user;
    if (!draft || !record) return;
    setSaving(true);
    setError(null);
    try {
      await updatePhoneFollowup({
        id: record.id,
        admin_followup_status: draft.status,
        admin_note: draft.note,
      });
      await search();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "ذخیره پیگیری ناموفق بود",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canFollowUp) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-8">
        <section className="tool-surface p-6">
          دسترسی به پیگیری شماره ندارید.
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold">پیگیری شماره تلفن</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          شماره را جست‌وجو کنید تا درخواست مشاوره و وضعیت پیگیری آن نمایش داده
          شود.
        </p>
      </div>
      <section className="tool-surface grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>شماره موبایل</Label>
          <Input
            className="ltr text-left"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
            inputMode="tel"
            placeholder="09123456789"
          />
        </div>
        <Button type="button" onClick={() => void search()} loading={loading}>
          <Search className="h-4 w-4" />
          جست‌وجو
        </Button>
      </section>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {data ? (
        <>
          <p className="text-sm text-muted-foreground">
            نتیجه برای{" "}
            <span className="ltr inline-block font-medium text-foreground">
              {data.phone}
            </span>
          </p>
          <FollowupCard
            title="درخواست مشاوره"
            exists={Boolean(data.user)}
            meta={
              data.user
                ? `${data.user.full_name ?? "بدون نام"} · ${data.user.order_count.toLocaleString("fa-IR")} سفارش · ثبت درخواست ${formatDateTime(data.user.created_at)} · IP ثبت‌نام ${data.user.signup_ip ?? "-"}`
                : undefined
            }
            draft={userDraft}
            saving={saving}
            onChange={setUserDraft}
            onSave={() => void save()}
          />
        </>
      ) : null}
    </main>
  );
}

function FollowupCard({
  title,
  exists,
  meta,
  draft,
  saving,
  onChange,
  onSave,
}: {
  title: string;
  exists: boolean;
  meta?: string;
  draft: { status: UserFollowupStatus; note: string } | null;
  saving: boolean;
  onChange: (
    value: { status: UserFollowupStatus; note: string } | null,
  ) => void;
  onSave: () => void;
}) {
  if (!exists || !draft)
    return (
      <section className="tool-surface p-5">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          رکوردی با این شماره پیدا نشد.
        </p>
      </section>
    );
  return (
    <section className="tool-surface grid gap-4 p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-start">
        <div className="space-y-2">
          <Label>وضعیت پیگیری</Label>
          <Select
            value={draft.status}
            disabled={saving}
            onChange={(event) =>
              onChange({
                ...draft,
                status: event.target.value as UserFollowupStatus,
              })
            }
          >
            {(Object.keys(statusLabels) as UserFollowupStatus[]).map((key) => (
              <option key={key} value={key}>
                {statusLabels[key]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>یادداشت پیگیری</Label>
          <Textarea
            value={draft.note}
            disabled={saving}
            maxLength={2000}
            className="min-h-20 resize-y"
            onChange={(event) =>
              onChange({ ...draft, note: event.target.value })
            }
            placeholder="نتیجه تماس یا توضیحات..."
          />
        </div>
        <Button
          className="mt-8"
          type="button"
          loading={saving}
          onClick={onSave}
        >
          <Save className="h-4 w-4" />
          ذخیره
        </Button>
      </div>
    </section>
  );
}

export default function FollowUpPage() {
  return (
    <AuthGate>
      <FollowUpPanel />
    </AuthGate>
  );
}
