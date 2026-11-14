"use client";

import { CalendarClock, Megaphone, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AuthGate } from "../../../components/auth/AuthProvider";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { campaignCheckpoint, type AdvertisingCampaign, type AdvertisingChannel, type CampaignInput } from "../../../lib/advertising";
import { getAdminAdvertising, saveAdminAdvertising } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";

const number = new Intl.NumberFormat("fa-IR");
const tehranInputDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
});

function displayCount(value: number | null) {
  return value === null ? "ثبت نشده" : number.format(value);
}

type CountField = "subscribers_before" | "subscribers_after_24h" | "subscribers_after_48h" | "orders_first_24h" | "orders_second_24h";
type Draft = Record<CountField, string> & {
  id?: string;
  version?: number;
  channel_username: string;
  channel_name: string;
  channel_choice: string;
  published_at: string;
};

function campaignDraft(channels: AdvertisingChannel[], campaign?: AdvertisingCampaign): Draft {
  const handle = campaign?.channel_username ?? channels[0]?.username.toLowerCase() ?? "";
  const choice = channels.find((channel) => channel.username.toLowerCase() === handle);
  return {
    id: campaign?.id,
    version: campaign?.version,
    channel_username: handle,
    channel_name: campaign?.channel_name ?? choice?.name ?? "",
    channel_choice: choice ? handle : "other",
    published_at: tehranInputDate.format(campaign ? new Date(campaign.published_at) : new Date()).replace(" ", "T"),
    subscribers_before: String(campaign?.subscribers_before ?? ""),
    subscribers_after_24h: String(campaign?.subscribers_after_24h ?? ""),
    subscribers_after_48h: String(campaign?.subscribers_after_48h ?? ""),
    orders_first_24h: String(campaign?.orders_first_24h ?? ""),
    orders_second_24h: String(campaign?.orders_second_24h ?? "")
  };
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ChannelLink({ username }: { username: string }) {
  return (
    <a className="inline-block break-all font-medium text-primary underline-offset-4 hover:underline" dir="ltr"
      href={`https://t.me/${username}`} target="_blank" rel="noopener noreferrer">
      @{username}
    </a>
  );
}

function Checkpoint({ campaign, hours }: { campaign: AdvertisingCampaign; hours: 24 | 48 }) {
  const members = hours === 24 ? campaign.subscribers_after_24h : campaign.subscribers_after_48h;
  const orders = hours === 24 ? campaign.orders_first_24h : campaign.orders_second_24h;
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <p className="text-sm font-semibold">{number.format(hours)} ساعت بعد</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(campaignCheckpoint(campaign.published_at, hours))}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">اعضای دانشیار</dt><dd className="mt-1 font-semibold">{displayCount(members)}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">سفارش‌ها ({hours === 24 ? "۰ تا ۲۴" : "۲۴ تا ۴۸"} ساعت)</dt>
          <dd className="mt-1 font-semibold">{displayCount(orders)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ChannelRankings({ channels }: { channels: AdvertisingChannel[] }) {
  return (
    <section id="advertising-channels" className="tool-surface min-w-0 scroll-mt-28 p-5" aria-labelledby="advertising-channels-title">
      <h2 id="advertising-channels-title" className="text-lg font-semibold">کانال‌ها و تعرفه‌ها</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">آمار ۲۱ آبان ۱۴۰۵. بازدید اخیر، میانهٔ بازدید پست‌های ۱ تا ۳ روزه است.</p>
      {channels.length ? (
        <div className="mt-4 overflow-x-auto rounded focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} role="region" aria-label="جدول رتبه‌بندی کانال‌ها">
          <table className="w-full min-w-[780px] text-right text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
              <tr>{["رتبه", "کانال و ادمین", "عضو", "بازدید اخیر", "امتیاز از ۱۰", "تعرفه", "پاسخ ادمین"].map((label) =>
                <th key={label} scope="col" className="whitespace-nowrap px-3 py-3">{label}</th>
              )}</tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.username} className="border-b border-border/70 align-top">
                  <td className="px-3 py-3 font-semibold tabular-nums">{number.format(channel.rank)}</td>
                  <th scope="row" className="min-w-44 space-y-1 px-3 py-3 text-right font-normal">
                    <p className="font-semibold">{channel.name}</p>
                    <p><ChannelLink username={channel.username} /></p>
                    <p className="text-xs text-muted-foreground">ادمین <ChannelLink username={channel.admin_username} /></p>
                  </th>
                  <td className="px-3 py-3 tabular-nums">{number.format(channel.member_count)}</td>
                  <td className="px-3 py-3 tabular-nums">{number.format(channel.recent_views)}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{number.format(channel.score)}</td>
                  <td className="min-w-36 px-3 py-3">
                    {channel.quoted_price_toman !== null && <p className="whitespace-nowrap font-semibold">{number.format(channel.quoted_price_toman)} تومان</p>}
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{channel.plan}</p>
                  </td>
                  <td className="min-w-48 px-3 py-3">
                    {channel.replies.length ? (
                      <details className="space-y-2">
                        <summary className="cursor-pointer rounded text-primary focus-visible:ring-2 focus-visible:ring-ring">مشاهدهٔ متن پاسخ‌ها</summary>
                        {channel.replies.map((message) => (
                          <div key={message.id} className="rounded-md bg-muted/60 p-3">
                            <time dateTime={message.date} className="text-xs text-muted-foreground">{formatDateTime(message.date)}</time>
                            <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-xs leading-6">{message.text || "پیام رسانه‌ای"}</p>
                          </div>
                        ))}
                        {channel.reply_context && <p dir="auto" className="break-all text-xs leading-6 text-muted-foreground">{channel.reply_context}</p>}
                      </details>
                    ) : <span className="text-xs text-muted-foreground">در انتظار پاسخ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">کانالی در فهرست ثبت نشده است.</p>}
    </section>
  );
}

function AdvertisingPanel() {
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getAdminAdvertising>> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const formOpen = draft !== null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getAdminAdvertising(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setDashboard(data); })
      .catch(() => { if (!controller.signal.aborted) setError("دریافت اطلاعات تبلیغات انجام نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (formOpen) {
      formRef.current?.scrollIntoView({ block: "start" });
      formRef.current?.querySelector("select")?.focus({ preventScroll: true });
    }
  }, [formOpen]);

  function start(campaign?: AdvertisingCampaign) {
    setNotice("");
    setFormError("");
    setDraft(campaignDraft(dashboard?.channels ?? [], campaign));
  }

  function setField(field: CountField | "channel_name" | "channel_username" | "published_at", value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : null);
  }

  function countField(field: CountField, label: string, required = false) {
    return (
      <Field id={field} label={label}>
        <Input id={field} type="number" min={0} max={2147483647} step={1} required={required}
          value={draft?.[field] ?? ""} onChange={(event) => setField(field, event.target.value)} />
      </Field>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const optionalCount = (value: string) => value === "" ? null : Number(value);
      const input: CampaignInput = {
        channel_username: draft.channel_username.trim().replace(/^@/, ""),
        channel_name: draft.channel_name.trim(),
        published_at: new Date(`${draft.published_at}:00+03:30`).toISOString(),
        subscribers_before: Number(draft.subscribers_before),
        subscribers_after_24h: optionalCount(draft.subscribers_after_24h),
        subscribers_after_48h: optionalCount(draft.subscribers_after_48h),
        orders_first_24h: optionalCount(draft.orders_first_24h),
        orders_second_24h: optionalCount(draft.orders_second_24h)
      };
      const saved = await saveAdminAdvertising(draft.id && draft.version ? { ...input, id: draft.id, version: draft.version } : input);
      setDashboard((previous) => previous ? {
        ...previous,
        campaigns: [saved, ...previous.campaigns.filter((item) => item.id !== saved.id)]
          .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
      } : previous);
      setDraft(null);
      setNotice(draft.id ? "آمار انتشار ذخیره شد." : "انتشار تبلیغ ثبت شد.");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setFormError(detail && !detail.startsWith("[") && detail !== "Internal server error"
        ? detail : "ذخیره انجام نشد. تاریخ، آیدی کانال و تعدادها را بررسی کنید.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <header className="tool-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">تبلیغات تلگرام</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">تعرفهٔ کانال‌ها و آمار ۲۴ و ۴۸ ساعت بعد از انتشار</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href="#advertising-channels">کانال‌ها و تعرفه‌ها</a></Button>
          <Button type="button" disabled={!dashboard || saving} onClick={() => start()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> ثبت انتشار
          </Button>
        </div>
      </header>

      {loading && <p role="status" className="tool-surface p-4 text-sm">در حال دریافت اطلاعات تبلیغات…</p>}
      {error && <div role="alert" className="tool-surface flex items-center gap-3 p-4 text-sm text-red-800">
        {error}<Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>
      </div>}
      {notice && <p role="status" className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}

      {draft && (
        <form ref={formRef} onSubmit={save} className="tool-surface grid scroll-mt-28 gap-4 p-5" aria-labelledby="campaign-form-title">
          <h2 id="campaign-form-title" className="text-lg font-semibold">{draft.id ? "ویرایش انتشار و آمار" : "ثبت انتشار تبلیغ"}</h2>
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="campaign-channel" label="کانال محل انتشار">
              <Select id="campaign-channel" value={draft.channel_choice} onChange={(event) => {
                const choice = event.target.value;
                const channel = dashboard?.channels.find((item) => item.username.toLowerCase() === choice);
                setDraft({ ...draft, channel_choice: choice, channel_username: channel ? choice : "", channel_name: channel?.name ?? "" });
              }}>
                {dashboard?.channels.map((channel) => (
                  <option key={channel.username} value={channel.username.toLowerCase()}>
                    {`${channel.name} (\u2066@${channel.username}\u2069)`}
                  </option>
                ))}
                <option value="other">کانال دیگر</option>
              </Select>
            </Field>
            <Field id="campaign-date" label="تاریخ و ساعت انتشار (تهران)">
              <Input id="campaign-date" type="datetime-local" required dir="ltr" value={draft.published_at} onChange={(event) => setField("published_at", event.target.value)} />
            </Field>
            {countField("subscribers_before", "اعضای دانشیار قبل از انتشار", true)}
            {draft.channel_choice === "other" && <>
              <Field id="other-channel-name" label="نام کانال">
                <Input id="other-channel-name" required maxLength={200} value={draft.channel_name} onChange={(event) => setField("channel_name", event.target.value)} />
              </Field>
              <Field id="other-channel-handle" label="آیدی کانال">
                <Input id="other-channel-handle" required pattern="@?[A-Za-z][A-Za-z0-9_]{3,31}" dir="ltr"
                  maxLength={33} value={draft.channel_username} onChange={(event) => setField("channel_username", event.target.value)} />
              </Field>
            </>}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset disabled={saving} className="grid gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-semibold">آمار ۲۴ ساعت بعد</legend>
              {countField("subscribers_after_24h", "اعضای دانشیار در ساعت ۲۴")}
              {countField("orders_first_24h", "سفارش‌ها از انتشار تا ۲۴ ساعت بعد")}
            </fieldset>
            <fieldset disabled={saving} className="grid gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-semibold">آمار ۴۸ ساعت بعد</legend>
              {countField("subscribers_after_48h", "اعضای دانشیار در ساعت ۴۸")}
              {countField("orders_second_24h", "سفارش‌ها از ساعت ۲۴ تا ۴۸")}
            </fieldset>
          </div>
          {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>ذخیره</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>انصراف</Button>
          </div>
        </form>
      )}

      {dashboard && <>
        <section className="tool-surface p-5" aria-labelledby="advertising-campaigns-title">
          <h2 id="advertising-campaigns-title" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" /> انتشارهای ثبت‌شده
          </h2>
          {dashboard.campaigns.length === 0
            ? <p className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">هنوز تبلیغ منتشرشده‌ای ثبت نشده است.</p>
            : <div className="mt-4 grid gap-3">
              {dashboard.campaigns.map((campaign) => (
                <article key={campaign.id} className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 lg:grid-cols-[minmax(200px,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="space-y-1 text-sm">
                    <h3 className="font-semibold">{campaign.channel_name}</h3>
                    <p><ChannelLink username={campaign.channel_username} /></p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(campaign.published_at)}</p>
                    <p>قبل از انتشار <strong>{number.format(campaign.subscribers_before)}</strong> عضو</p>
                  </div>
                  <Checkpoint campaign={campaign} hours={24} />
                  <Checkpoint campaign={campaign} hours={48} />
                  <Button variant="outline" type="button" disabled={saving} onClick={() => start(campaign)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> ویرایش آمار
                  </Button>
                </article>
              ))}
            </div>}
        </section>
        <ChannelRankings channels={dashboard.channels} />
      </>}
    </main>
  );
}

export default function AdminAdvertisingPage() {
  return <AuthGate adminOnly><AdvertisingPanel /></AuthGate>;
}
