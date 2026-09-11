"use client";

import {
  ArrowRight,
  Download,
  Edit3,
  FileUp,
  MessageSquarePlus,
  RefreshCcw,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthGate } from "../../../../components/auth/AuthProvider";
import { StatusBadge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import {
  absoluteUrl,
  addPaymentNote,
  addReviewNote,
  getAdminOrder,
  updateAdminStatus,
} from "../../../../lib/api";
import {
  formatBytes,
  formatDateTime,
  paymentStatuses,
  paymentStatusLabel,
  orderStatuses,
  statusLabel,
} from "../../../../lib/format";
import { quantityLabel } from "../../../../lib/order-options";
import type { Order, OrderFile, OrderStatus, PaymentNote, PaymentNoteType, PaymentStatus, WorkerRun } from "../../../../types/api";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function AdminOrderDetail() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ? decodeURIComponent(params.orderId) : "";
  const [order, setOrder] = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus>("approved");
  const [statusNotes, setStatusNotes] = useState("");
  const [reviewAuthor, setReviewAuthor] = useState("مدیر");
  const [reviewNote, setReviewNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null);
  const [moarrefPaymentStatus, setMoarrefPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [moarrefPaymentNote, setMoarrefPaymentNote] = useState("");
  const [moarrefPaymentReceipt, setMoarrefPaymentReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [approvingOrder, setApprovingOrder] = useState(false);
  const [savingReviewNote, setSavingReviewNote] = useState(false);
  const [savingPaymentNote, setSavingPaymentNote] = useState<PaymentNoteType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  async function loadOrder() {
    if (!orderId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getAdminOrder(orderId);
      setOrder(result);
      setNextStatus(result.status);
      setPaymentStatus(result.payment_status);
      setMoarrefPaymentStatus(result.moarref_payment_status);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "بارگذاری سفارش ناموفق بود",
      );
    } finally {
      setLoading(false);
    }
  }

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
  }

  async function saveStatus() {
    if (!order) {
      return;
    }
    setError(null);
    setSavingStatus(true);
    try {
      const result = await updateAdminStatus(
        order.id,
        nextStatus,
        statusNotes || undefined,
      );
      setOrder(result);
      setStatusNotes("");
      showToast("success", "وضعیت سفارش با موفقیت ذخیره شد.");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "به‌روزرسانی وضعیت ناموفق بود";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveReviewNote() {
    if (!order || !reviewNote.trim()) {
      return;
    }
    setError(null);
    setSavingReviewNote(true);
    try {
      await addReviewNote(order.id, reviewAuthor, reviewNote.trim());
      const result = await getAdminOrder(order.id);
      setOrder(result);
      setReviewNote("");
      showToast("success", "یادداشت داخلی مدیر ثبت شد.");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "ثبت یادداشت ناموفق بود";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingReviewNote(false);
    }
  }

  async function savePayment(noteType: PaymentNoteType) {
    if (!order) {
      return;
    }

    const isMoarref = noteType === "moarref_payment";
    const selectedStatus = isMoarref ? moarrefPaymentStatus : paymentStatus;
    const note = isMoarref ? moarrefPaymentNote : paymentNote;
    const receipt = isMoarref ? moarrefPaymentReceipt : paymentReceipt;

    setError(null);
    setSavingPaymentNote(noteType);
    try {
      const result = await addPaymentNote(order.id, noteType, selectedStatus, note.trim(), receipt);
      setOrder(result);
      setPaymentStatus(result.payment_status);
      setMoarrefPaymentStatus(result.moarref_payment_status);
      if (isMoarref) {
        setMoarrefPaymentNote("");
        setMoarrefPaymentReceipt(null);
      } else {
        setPaymentNote("");
        setPaymentReceipt(null);
      }
      showToast("success", isMoarref ? "وضعیت پرداخت معرف ذخیره شد." : "وضعیت پرداخت سفارش ذخیره شد.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "ثبت وضعیت پرداخت ناموفق بود";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingPaymentNote(null);
    }
  }

  async function approveOrder() {
    if (!order) {
      return;
    }
    setError(null);
    setApprovingOrder(true);
    try {
      const result = await updateAdminStatus(
        order.id,
        "approved",
        "سفارش بررسی و برای شروع انجام تأیید شد.",
      );
      setOrder(result);
      setNextStatus(result.status);
      setStatusNotes("");
      showToast("success", "سفارش با موفقیت تأیید و ذخیره شد.");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "تأیید سفارش ناموفق بود";
      setError(message);
      showToast("error", message);
    } finally {
      setApprovingOrder(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                فهرست سفارش‌ها
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">
            جزئیات سفارش
          </h1>
        </div>
        <Button
          type="button"
          onClick={() => void loadOrder()}
          loading={loading}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          تازه‌سازی
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}
      {loading && !order ? (
        <section className="tool-surface p-5 text-sm text-muted-foreground">
          در حال بارگذاری سفارش...
        </section>
      ) : null}

      {order ? (
        <section className="tool-surface p-5">
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{order.title}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {order.status === "submitted" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/status?order=${encodeURIComponent(order.id)}&edit=1`}>
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      ویرایش پروژه و فایل‌ها
                    </Link>
                  </Button>
                ) : null}
                <StatusBadge status={order.status} />
              </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">مشتری</dt>
                <dd className="ltr text-left font-medium">{order.customer.phone ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">نام دانشجو</dt>
                <dd className="font-medium">{order.student_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">شماره دانشجویی</dt>
                <dd className="ltr text-left font-medium">{order.student_number ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ایمیل</dt>
                <dd className="ltr text-left font-medium">
                  {order.correspondence_email}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">شماره تماس</dt>
                <dd className="ltr text-left font-medium">
                  {order.customer.phone ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">نوع سفارش</dt>
                <dd className="font-medium">{order.order_type ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">کد معرف</dt>
                <dd className="ltr text-left font-medium">{order.moarref_code ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">وضعیت پرداخت</dt>
                <dd className="font-medium">{paymentStatusLabel(order.payment_status)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">وضعیت پرداخت معرف</dt>
                <dd className="font-medium">{paymentStatusLabel(order.moarref_payment_status)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">مقطع تحصیلی</dt>
                <dd className="font-medium">{order.degree}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">دانشگاه</dt>
                <dd className="font-medium">{order.university}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">رشته یا گرایش</dt>
                <dd className="font-medium">{order.field_of_study ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">دانشکده</dt>
                <dd className="font-medium">{order.faculty ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">گروه آموزشی</dt>
                <dd className="font-medium">{order.department ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">استاد راهنما</dt>
                <dd className="font-medium">{order.advisor_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">استاد مشاور</dt>
                <dd className="font-medium">{order.consultant_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">استاد درس</dt>
                <dd className="font-medium">{order.instructor_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">نام درس</dt>
                <dd className="font-medium">{order.course_name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">عنوان انگلیسی</dt>
                <dd className="font-medium">{order.title_english ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">کلیدواژه‌ها</dt>
                <dd className="font-medium">{order.keywords ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">حجم موردنیاز</dt>
                <dd className="font-medium">
                  {order.quantity_value
                    ? `${order.quantity_value.toLocaleString("fa-IR")} ${quantityLabel(order.quantity_type)}`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">تعداد عکس</dt>
                <dd className="font-medium">
                  {order.image_count || order.image_count === 0
                    ? order.image_count.toLocaleString("fa-IR")
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">گراف و چارت</dt>
                <dd className="font-medium">{order.requires_charts ? "نیاز است" : "نیاز نیست"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">روش یا رویکرد انجام</dt>
                <dd className="font-medium">{order.methodology}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">تاریخ ثبت</dt>
                <dd className="font-medium">
                  {formatDateTime(order.created_at)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">چکیده یا شرح مسئله</dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {order.abstract ?? "-"}
                </dd>
              </div>
            </dl>

            <OrderFilesSection files={order.files} />

            <div className="grid gap-3 rounded-md border border-border bg-white p-4">
              <h3 className="font-semibold">بررسی و تغییر وضعیت</h3>
              <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label>وضعیت جدید</Label>
                  <Select
                    value={nextStatus}
                    onChange={(event) =>
                      setNextStatus(event.target.value as OrderStatus)
                    }
                  >
                    {orderStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>یادداشت برای تاریخچه سفارش</Label>
                  <Input
                    value={statusNotes}
                    onChange={(event) => setStatusNotes(event.target.value)}
                    placeholder="مثلاً: اطلاعات سفارش کامل است و برای انجام تأیید شد."
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void saveStatus()}
                  loading={savingStatus}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  ذخیره
                </Button>
              </div>
              {order.status === "submitted" ? (
                <Button
                  type="button"
                  className="w-fit"
                  onClick={() => void approveOrder()}
                  loading={approvingOrder}
                >
                  تأیید سفارش و ارسال برای انجام
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PaymentPanel
                title="پرداخت سفارش"
                status={paymentStatus}
                onStatusChange={setPaymentStatus}
                note={paymentNote}
                onNoteChange={setPaymentNote}
                onReceiptChange={setPaymentReceipt}
                receipt={paymentReceipt}
                notes={order.payment_notes?.filter((note) => note.note_type === "payment") ?? []}
                saving={savingPaymentNote === "payment"}
                onSave={() => void savePayment("payment")}
              />
              <PaymentPanel
                title="پرداخت معرف"
                status={moarrefPaymentStatus}
                onStatusChange={setMoarrefPaymentStatus}
                note={moarrefPaymentNote}
                onNoteChange={setMoarrefPaymentNote}
                onReceiptChange={setMoarrefPaymentReceipt}
                receipt={moarrefPaymentReceipt}
                notes={order.payment_notes?.filter((note) => note.note_type === "moarref_payment") ?? []}
                saving={savingPaymentNote === "moarref_payment"}
                onSave={() => void savePayment("moarref_payment")}
              />
            </div>

            <div className="grid gap-3 rounded-md border border-border bg-white p-4">
              <h3 className="font-semibold">خروجی‌ها</h3>
              {order.final_outputs?.length ? (
                <div className="grid gap-2">
                  {order.final_outputs.map((output) => (
                    <a
                      key={output.id}
                      href={absoluteUrl(output.url)}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm hover:bg-teal-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {output.original_name}
                        </span>
                        <span className="ltr block text-left text-xs text-muted-foreground">
                          {output.output_type} ·{" "}
                          {formatBytes(output.size_bytes)}
                        </span>
                      </span>
                      <Download
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  هنوز خروجی وجود ندارد.
                </div>
              )}
            </div>

            <WorkerRunHistory runs={order.worker_submissions ?? []} />

            <div className="grid gap-3 rounded-md border border-border bg-white p-4">
              <h3 className="font-semibold">یادداشت داخلی مدیر</h3>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label>نویسنده داخلی</Label>
                  <Input
                    value={reviewAuthor}
                    onChange={(event) => setReviewAuthor(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>یادداشت</Label>
                  <Input
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveReviewNote()}
                  loading={savingReviewNote}
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  افزودن
                </Button>
              </div>
              {order.review_notes?.length ? (
                <div className="grid gap-2">
                  {order.review_notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-md bg-muted p-3 text-sm"
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="font-medium">{note.author}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(note.created_at)}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{note.note}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </main>
  );
}

function WorkerRunHistory({ runs }: { runs: WorkerRun[] }) {
  const totalCost = runs.reduce((sum, run) => sum + Number(run.estimated_cost_usd ?? 0), 0);
  const totalTokens = runs.reduce((sum, run) => sum + Number(run.total_tokens ?? 0), 0);
  const byModel = Object.values(runs.reduce<Record<string, { model: string; runs: number; tokens: number; cost: number }>>((result, run) => {
    const model = run.model ?? "مدل نامشخص";
    const row = result[model] ?? { model, runs: 0, tokens: 0, cost: 0 };
    row.runs += 1;
    row.tokens += Number(run.total_tokens ?? 0);
    row.cost += Number(run.estimated_cost_usd ?? 0);
    result[model] = row;
    return result;
  }, {}));
  const usd = (amount: number | null | undefined) => amount == null ? "نرخ نامشخص" : `$${Number(amount).toFixed(6)}`;
  return <div className="grid gap-3 rounded-md border border-border bg-white p-4">
    <h3 className="font-semibold">تاریخچه اجرای Worker و مصرف مدل</h3>
    {runs.length ? <><div className="grid gap-2 rounded-md border border-teal-100 bg-teal-50 p-3 text-sm sm:grid-cols-2">
      <div><div className="text-muted-foreground">هزینه تخمینی کل</div><div className="mt-1 text-base font-semibold">{usd(totalCost)}</div></div>
      <div><div className="text-muted-foreground">مجموع توکن همه اجراها</div><div className="mt-1 text-base font-semibold">{totalTokens.toLocaleString("fa-IR")}</div></div>
    </div>
    <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[420px] text-right text-sm"><thead className="bg-muted text-muted-foreground"><tr><th className="p-2">مدل</th><th className="p-2">اجرا</th><th className="p-2">توکن</th><th className="p-2">هزینه تخمینی</th></tr></thead><tbody>{byModel.map((row) => <tr key={row.model} className="border-t border-border"><td className="p-2 ltr text-left">{row.model}</td><td className="p-2">{row.runs.toLocaleString("fa-IR")}</td><td className="p-2">{row.tokens.toLocaleString("fa-IR")}</td><td className="p-2">{usd(row.cost)}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">هزینه‌ها با نرخ snapshot شده‌ی OpenAI برای هر اجرا محاسبه می‌شوند؛ هزینه‌ی ابزارها و سرویس‌های جانبی در این عدد نیست.</p>
    <div className="grid gap-2">{runs.map((run) => <div key={run.id} className="rounded-md bg-muted p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span>{run.model ?? "-"} · {run.mode ?? "-"} · {run.run_status ?? "-"}</span><span className="text-muted-foreground">{formatDateTime(run.finished_at ?? run.created_at)}</span></div>
      <div className="mt-1 text-muted-foreground">Input: {(run.input_tokens ?? 0).toLocaleString("fa-IR")} · Cached: {(run.cached_input_tokens ?? 0).toLocaleString("fa-IR")} · Output: {(run.output_tokens ?? 0).toLocaleString("fa-IR")} · Reasoning: {(run.reasoning_tokens ?? 0).toLocaleString("fa-IR")} · Total: {(run.total_tokens ?? 0).toLocaleString("fa-IR")}</div>
      <div className="mt-1 font-medium">هزینه تخمینی: {usd(run.estimated_cost_usd)}</div>
    </div>)}</div></> : <p className="text-sm text-muted-foreground">هنوز اجرایی ثبت نشده است.</p>}
  </div>;
}

function OrderFilesSection({ files }: { files?: OrderFile[] }) {
  const groups = [
    { type: "university_guideline", label: "شیوه‌نامه و قالب" },
    { type: "reference_file", label: "منابع و مقالات" },
    { type: "supporting_material", label: "فایل‌های تکمیلی" }
  ].map((group) => ({
    ...group,
    files: files?.filter((file) => file.file_type === group.type) ?? []
  }));
  const otherFiles = files?.filter((file) => !groups.some((group) => group.files.includes(file))) ?? [];
  const visibleGroups = otherFiles.length
    ? [...groups, { type: "other", label: "سایر فایل‌ها", files: otherFiles }]
    : groups;

  return (
    <div className="grid gap-4 rounded-md border border-border bg-white p-4">
      <div>
        <h3 className="font-semibold">فایل‌های پروژه</h3>
        <p className="mt-1 text-sm text-muted-foreground">فایل‌های ارسال‌شده توسط مشتری، دسته‌بندی‌شده بر اساس کاربرد.</p>
      </div>
      {files?.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {visibleGroups.map((group) => (
            <div key={group.type} className="grid content-start gap-2 rounded-md border border-border p-3">
              <h4 className="text-sm font-semibold">{group.label}</h4>
              {group.files.length ? group.files.map((file) => (
                <a
                  key={file.id}
                  href={absoluteUrl(file.url)}
                  download={file.original_name}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm hover:bg-teal-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{file.original_name}</span>
                    <span className="ltr block text-left text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span>
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                </a>
              )) : <p className="text-xs text-muted-foreground">فایلی ثبت نشده است.</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">هنوز فایلی برای این پروژه ثبت نشده است.</div>
      )}
    </div>
  );
}

function PaymentPanel({
  title,
  status,
  onStatusChange,
  note,
  onNoteChange,
  receipt,
  onReceiptChange,
  notes,
  saving,
  onSave
}: {
  title: string;
  status: PaymentStatus;
  onStatusChange: (status: PaymentStatus) => void;
  note: string;
  onNoteChange: (note: string) => void;
  receipt: File | null;
  onReceiptChange: (file: File | null) => void;
  notes: PaymentNote[];
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-3">
        <div className="space-y-2">
          <Label>وضعیت پرداخت</Label>
          <Select value={status} onChange={(event) => onStatusChange(event.target.value as PaymentStatus)}>
            {paymentStatuses.map((option) => (
              <option key={option} value={option}>
                {paymentStatusLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>یادداشت پرداخت</Label>
          <Textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="مثلاً: نصف مبلغ پرداخت شد و رسید ضمیمه است."
          />
        </div>
        <div className="space-y-2">
          <Label>رسید پرداخت</Label>
          <Input type="file" onChange={(event) => onReceiptChange(event.target.files?.[0] ?? null)} />
          {receipt ? <p className="text-xs text-muted-foreground">{receipt.name}</p> : null}
        </div>
        <Button type="button" className="w-fit" onClick={onSave} loading={saving}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          ذخیره پرداخت
        </Button>
      </div>

      {notes.length ? (
        <div className="grid gap-2">
          {notes.map((item) => (
            <div key={item.id} className="rounded-md bg-muted p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{paymentStatusLabel(item.payment_status)}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</span>
              </div>
              {item.note ? <p className="whitespace-pre-wrap text-muted-foreground">{item.note}</p> : null}
              {item.url ? (
                <a href={absoluteUrl(item.url)} className="mt-2 inline-flex items-center gap-2 text-primary">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {item.original_name ?? "رسید پرداخت"}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          هنوز یادداشت پرداخت ثبت نشده است.
        </div>
      )}
    </div>
  );
}

export default function AdminOrderDetailPage() {
  return (
    <AuthGate adminOnly>
      <AdminOrderDetail />
    </AuthGate>
  );
}
