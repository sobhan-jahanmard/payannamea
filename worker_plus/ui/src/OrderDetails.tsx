import { useState } from "react";
import { Check, Download, LoaderCircle, Pencil } from "lucide-react";
import { ORDER_STATUS_DEFINITIONS } from "../../../frontend/src/lib/order-status";
import "./order-details.css";

type OrderRecord = Record<string, unknown>;
type RunRecord = Record<string, unknown>;

const fieldGroups = [
  { title: "مشخصات سفارش", fields: [
    ["student_name", "نام دانشجو"], ["student_number", "شماره دانشجویی"],
    ["correspondence_email", "ایمیل مکاتبه"], ["degree", "مقطع"],
    ["university", "دانشگاه"], ["field_of_study", "رشته"],
    ["faculty", "دانشکده"], ["department", "گروه آموزشی"],
    ["course_name", "درس"], ["instructor_name", "استاد درس"],
    ["advisor_name", "استاد راهنما"], ["consultant_name", "استاد مشاور"],
    ["language", "زبان"], ["methodology", "روش کار"],
    ["title_english", "عنوان انگلیسی"], ["keywords", "کلیدواژه‌ها"],
    ["abstract", "چکیده یا شرح مسئله"], ["notes", "توضیحات سفارش"],
    ["requires_charts", "نیاز به نمودار"], ["presentation_style", "سبک ارائه"],
    ["presentation_font", "فونت ارائه"], ["moarref_code", "کد معرف"],
  ] },
  { title: "زمان و پرداخت", fields: [
    ["created_at", "زمان ثبت"], ["updated_at", "آخرین ویرایش"],
    ["deadline", "موعد تحویل"], ["payment_status", "وضعیت پرداخت"],
    ["moarref_payment_status", "وضعیت پرداخت معرف"],
  ] },
] as const;

const knownKeys = new Set<string>([
  "id", "title", "subject", "order_type", "status", "quantity", "quantity_type", "quantity_value",
  ...fieldGroups.flatMap(group => group.fields.map(([key]) => key)),
  "files", "references", "customer", "created_by", "status_logs", "final_outputs",
  "review_notes", "payment_notes", "worker_submissions",
]);
const paymentLabels: Record<string, string> = {
  not_paid: "پرداخت نشده", fully_paid: "پرداخت کامل",
  partially_paid: "پرداخت بخشی", refunded: "برگشت داده شده",
};

const collectionLabels: Record<string, string> = {
  files: "فایل‌های ورودی", references: "منابع", status_logs: "تاریخچهٔ وضعیت",
  payment_notes: "یادداشت‌های پرداخت", review_notes: "یادداشت‌های بازبینی",
  final_outputs: "خروجی‌های ثبت‌شده",
};
const itemLabels: Record<string, string> = {
  original_name: "نام فایل", file_type: "نوع فایل", size_bytes: "حجم (بایت)",
  title: "عنوان", authors: "نویسندگان", year: "سال", url: "نشانی",
  reference_type: "نوع منبع", required_usage: "استفاده الزامی", notes: "توضیحات",
  note: "یادداشت", from_status: "وضعیت قبلی", to_status: "وضعیت جدید",
  created_at: "زمان ثبت", uploaded_by: "بارگذاری‌کننده", output_type: "نوع خروجی",
  payment_status: "وضعیت پرداخت", note_type: "نوع یادداشت", content_type: "نوع محتوا",
};

function record(value: unknown): OrderRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as OrderRecord : null;
}

function records(value: unknown): OrderRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is OrderRecord => item !== null) : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  return String(value);
}

function displayField(key: string, value: unknown): string {
  if (key === "payment_status" || key === "moarref_payment_status") return paymentLabels[String(value)] || text(value);
  if (key.endsWith("_at") || key === "deadline") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString("fa-IR");
  }
  return text(value);
}

function formatNumber(value: unknown): string {
  const parsed = number(value);
  return parsed === null ? "—" : parsed.toLocaleString("fa-IR");
}

function dollars(value: unknown): string {
  const parsed = number(value);
  if (parsed === null) return "نامشخص";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
    maximumFractionDigits: parsed > 0 && parsed < 0.01 ? 6 : 4,
  }).format(parsed);
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="order-detail-item"><dt>{label}</dt><dd dir="auto">{value}</dd></div>;
}

function OrderCollection({ collection, title, entries, downloading, onDownload }: {
  collection: string;
  title: string;
  entries: OrderRecord[];
  downloading: string;
  onDownload: (collection: "files" | "final_outputs" | "payment_notes", entry: OrderRecord) => void;
}) {
  const downloadable = collection === "files" || collection === "final_outputs" || collection === "payment_notes";
  return <details className="order-detail-collection"><summary>{title} ({formatNumber(entries.length)})</summary>{entries.length ? entries.map((entry, index) => {
    const fileKey = `${collection}:${text(entry.id)}`;
    const canDownload = downloadable && typeof entry.id === "string" && typeof entry.storage_path === "string";
    return <div className="order-detail-entry" key={String(entry.id || index)}><div className="order-detail-entry-header"><b>{text(entry.original_name || entry.title || entry.note || entry.output_type || entry.to_status || `${title} ${index + 1}`)}</b>{canDownload && <button type="button" disabled={Boolean(downloading)} onClick={() => onDownload(collection, entry)}>{downloading === fileKey ? <LoaderCircle className="spin" size={14}/> : <Download size={14}/>} دانلود فایل از وب‌سایت</button>}</div><dl>{Object.entries(entry).filter(([, value]) => value !== null && value !== undefined && typeof value !== "object").map(([key, value]) => <DetailItem key={key} label={itemLabels[key] || key.replaceAll("_", " ")} value={displayField(key, value)}/>)}</dl></div>;
  }) : <p>موردی ثبت نشده است.</p>}</details>;
}

export function OrderDetails({ order, orderId, runStatus, liveUsage, onChangeOrder }: {
  order: OrderRecord;
  orderId: string;
  runStatus: string;
  liveUsage?: { calls: number; totalTokens: number; cachedInputTokens: number; unknown_usage_calls: number };
  onChangeOrder: () => void;
}) {
  const [downloading, setDownloading] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");
  async function downloadFile(collection: "files" | "final_outputs" | "payment_notes", entry: OrderRecord) {
    if (downloading || typeof entry.id !== "string") return;
    setDownloading(`${collection}:${entry.id}`); setDownloadError(""); setDownloadNotice("");
    try {
      const result = await window.workerPlus.downloadOrderFile(orderId, collection, entry.id);
      if (result.saved) setDownloadNotice(`فایل «${text(entry.original_name || entry.stored_name)}» ذخیره شد.`);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : String(error)); }
    finally { setDownloading(""); }
  }
  const hasRunHistory = Array.isArray(order.worker_submissions);
  const runs = records(order.worker_submissions) as RunRecord[];
  const pricedRuns = runs.filter(run => number(run.estimated_cost_usd) !== null);
  const totalCost = pricedRuns.length ? pricedRuns.reduce((sum, run) => sum + (number(run.estimated_cost_usd) || 0), 0) : null;
  const customer = record(order.customer);
  const extraFields = Object.entries(order).filter(([key, value]) => !knownKeys.has(key) && value !== null && value !== undefined && typeof value !== "object");
  const quantity = `${formatNumber(order.quantity_value ?? order.quantity)} ${
    ({ pages: "صفحه", words: "کلمه", slides: "اسلاید" } as Record<string, string>)[String(order.quantity_type)] || ""
  }`.trim();
  const status = String(order.status || "");

  return <section className="panel order-details" aria-labelledby="order-details-heading" dir="rtl">
    <div className="order-details-header">
      <div><span className="tag">{text(order.order_type)}</span><h2 id="order-details-heading">{text(order.title ?? order.subject)}</h2><span className="order-details-id" dir="ltr">{orderId}</span></div>
      <button type="button" className="edit-order" onClick={onChangeOrder}><Pencil size={14}/> تغییر سفارش</button>
    </div>
    <dl className="order-details-summary">
      <div className="order-detail-item status-fact"><dt>وضعیت سفارش</dt><dd>{ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || text(order.status)}</dd><div className="status-tooltip"><strong>وضعیت‌های سفارش</strong>{Object.entries(ORDER_STATUS_DEFINITIONS).map(([key, definition]) => <div key={key} className={status === key ? "active" : ""}><i>{status === key && <Check size={13}/>}</i><span>{definition.label}</span></div>)}</div></div>
      <DetailItem label="تعداد / حجم" value={quantity}/>
      <DetailItem label="آخرین اجرا" value={runStatus}/>
      <DetailItem label="موعد تحویل" value={displayField("deadline", order.deadline)}/>
    </dl>
    {!hasRunHistory && <p className="order-details-sync">جزئیات تکمیلی و سوابق هزینه هنوز از سرور دریافت نشده‌اند؛ اطلاعات ذخیره‌شدهٔ محلی نمایش داده می‌شود.</p>}
    <div className="order-details-body">
      <div className="order-details-information">
        {fieldGroups.map(group => <section key={group.title} className="order-detail-group"><h3>{group.title}</h3><dl>{group.fields.filter(([key]) => order[key] !== null && order[key] !== undefined && order[key] !== "").map(([key, label]) => <DetailItem key={key} label={label} value={displayField(key, order[key])}/>)}</dl></section>)}
        {customer && <section className="order-detail-group"><h3>مشتری</h3><dl><DetailItem label="شماره تماس" value={text(customer.phone)}/><DetailItem label="شناسه مشتری" value={text(customer.id)}/></dl></section>}
        {extraFields.length > 0 && <section className="order-detail-group"><h3>سایر مشخصات</h3><dl>{extraFields.map(([key, value]) => <DetailItem key={key} label={key.replaceAll("_", " ")} value={text(value)}/>)}</dl></section>}
        <section className="order-detail-group"><h3>پیوست‌ها و تاریخچهٔ سفارش</h3>{downloadError && <p className="order-download-error" role="alert">{downloadError}</p>}{downloadNotice && <p className="order-download-notice" role="status">{downloadNotice}</p>}<div className="order-detail-collections">{Object.entries(collectionLabels).map(([key, title]) => <OrderCollection key={key} collection={key} title={title} entries={records(order[key])} downloading={downloading} onDownload={downloadFile}/>)}</div></section>
      </div>
      <section className="order-costs" aria-labelledby="order-costs-heading">
        <h3 id="order-costs-heading">هزینه و مصرف AI</h3>
        <div className="order-cost-total"><span>مجموع هزینهٔ تخمینی اجراهای ثبت‌شده</span><strong dir="ltr">{totalCost === null ? "نامشخص" : dollars(totalCost)}</strong><small>{hasRunHistory ? `${formatNumber(pricedRuns.length)} اجرا دارای هزینه · ${formatNumber(runs.length - pricedRuns.length)} اجرا بدون دادهٔ هزینه` : "سوابق هزینه هنوز دریافت نشده است"}</small></div>
        {liveUsage && <div className="order-live-usage"><b>مصرف اجرای محلی</b><span>{formatNumber(liveUsage.calls)} فراخوانی · {formatNumber(liveUsage.totalTokens)} توکن</span><small>توکن کش: {formatNumber(liveUsage.cachedInputTokens)} · فراخوانی با مصرف نامشخص: {formatNumber(liveUsage.unknown_usage_calls)}</small></div>}
        <div className="order-cost-runs"><h4>جزئیات هر اجرا</h4>{runs.length ? runs.map((run, index) => <details key={String(run.id || index)}><summary><span>{text(run.model)} · {text(run.mode)}</span><b dir="ltr">{dollars(run.estimated_cost_usd)}</b></summary><dl><DetailItem label="وضعیت" value={text(run.run_status)}/><DetailItem label="زمان ثبت" value={displayField("created_at", run.created_at)}/><DetailItem label="توکن ورودی" value={formatNumber(run.input_tokens)}/><DetailItem label="توکن کش" value={formatNumber(run.cached_input_tokens)}/><DetailItem label="توکن خروجی" value={formatNumber(run.output_tokens)}/><DetailItem label="توکن استدلال" value={formatNumber(run.reasoning_tokens)}/><DetailItem label="مجموع توکن" value={formatNumber(run.total_tokens)}/><DetailItem label="نرخ ورودی / میلیون" value={dollars(run.input_price_per_million_usd)}/><DetailItem label="نرخ کش / میلیون" value={dollars(run.cached_input_price_per_million_usd)}/><DetailItem label="نرخ خروجی / میلیون" value={dollars(run.output_price_per_million_usd)}/></dl></details>) : <p>{hasRunHistory ? "هنوز هزینهٔ اجرایی ثبت نشده است." : "سوابق هزینه هنوز دریافت نشده است."}</p>}</div>
        <small className="order-cost-note">هزینهٔ دلاری اجرای جاری پس از ثبت در سوابق نشان داده می‌شود.</small>
      </section>
    </div>
  </section>;
}
