"use client";

import {
  ArrowRight,
  Download,
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
import {
  absoluteUrl,
  addReviewNote,
  getAdminOrder,
  updateAdminStatus,
} from "../../../../lib/api";
import {
  formatBytes,
  formatDateTime,
  orderStatuses,
  statusLabel,
} from "../../../../lib/format";
import { quantityLabel } from "../../../../lib/order-options";
import type { Order, OrderStatus } from "../../../../types/api";

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
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [approvingOrder, setApprovingOrder] = useState(false);
  const [savingReviewNote, setSavingReviewNote] = useState(false);
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
              <StatusBadge status={order.status} />
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">مشتری</dt>
                <dd className="font-medium">{order.customer.full_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ایمیل</dt>
                <dd className="ltr text-left font-medium">
                  {order.customer.email}
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

export default function AdminOrderDetailPage() {
  return (
    <AuthGate adminOnly>
      <AdminOrderDetail />
    </AuthGate>
  );
}
