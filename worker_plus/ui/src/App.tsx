import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, CircleCheck, CircleDashed, ExternalLink, FileText, LoaderCircle, Pencil, Play, RotateCcw, Search, Square, Terminal } from "lucide-react";
import type { WorkerState } from "./global";
import { ORDER_STATUS_DEFINITIONS } from "../../../frontend/src/lib/order-status";

const STEPS = [
  "01_fetch_order", "02_prepare_workspace", "03_check_intake", "04_extract_university_rules", "04a_build_order_contract",
  "05_collect_sources", "05a_analyze_customer_sources", "05b_resolve_source_rules", "06_build_thesis_plan", "06a_plan_visuals",
  "06b_generate_visual_assets", "07_generate_content", "07a_validate_visual_placement", "08_review_content",
  "08b_audit_source_compliance", "09_package_docx", "09b_polish_cover", "10b_finalize_persian_pagination",
  "10c_verify_persian_pagination", "10_validate_and_publish"
];

const labels: Record<string, string> = {
  "01_fetch_order": "دریافت سفارش", "02_prepare_workspace": "آماده‌سازی فضای کار", "03_check_intake": "بررسی ورودی‌ها",
  "04_extract_university_rules": "استخراج شیوه‌نامه", "04a_build_order_contract": "ساخت قرارداد سفارش", "05_collect_sources": "جمع‌آوری منابع",
  "05a_analyze_customer_sources": "تحلیل منابع مشتری", "05b_resolve_source_rules": "تثبیت قواعد منابع", "06_build_thesis_plan": "طراحی ساختار محتوا",
  "06a_plan_visuals": "برنامه‌ریزی تصاویر", "06b_generate_visual_assets": "تولید تصاویر", "07_generate_content": "تولید محتوا",
  "07a_validate_visual_placement": "کنترل جای‌گذاری تصاویر", "08_review_content": "بازبینی محتوا", "08b_audit_source_compliance": "ممیزی منابع",
  "09_package_docx": "ساخت Word", "09b_polish_cover": "پرداخت جلد", "10b_finalize_persian_pagination": "صفحه‌بندی فارسی",
  "10c_verify_persian_pagination": "کنترل صفحه‌بندی", "10_validate_and_publish": "اعتبارسنجی و انتشار"
};

function value(order: Record<string, unknown> | null, ...keys: string[]) { for (const key of keys) if (order?.[key]) return String(order[key]); return "—"; }
const runStatuses: Record<string, string> = { starting: "در حال شروع", in_progress: "در حال انجام", completed: "انجام‌شده", failed: "ناموفق", paused: "متوقف موقت" };
function orderStatus(status: string) { return ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || status || "—"; }
function runStatus(status?: string) { return status ? ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || runStatuses[status] || status : "اجرا نشده"; }

export function App() {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""); const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Record<string, unknown> | null>(null); const [state, setState] = useState<WorkerState | null>(null);
  const [logs, setLogs] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [offline, setOffline] = useState(true); const [sample, setSample] = useState(false); const [operatorNote, setOperatorNote] = useState("");

  const refresh = () => window.workerPlus.readState().then(setState);
  useEffect(() => {
    refresh(); const unsubscribe = window.workerPlus.onEvent(event => {
      if (event.type === "log") setLogs(previous => (previous + String(event.value)).slice(-100_000));
      if (event.type === "state") setState(event.value as WorkerState); if (event.type === "exit") refresh();
    }); return unsubscribe;
  }, []);

  async function lookup() { setBusy(true); setError(""); try { const result = await window.workerPlus.lookupOrder(query); setOrderId(result.id); setOrder(result.order); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function action(task: () => Promise<unknown>) { setError(""); setLogs(""); try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  async function openOutput(name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx") { setError(""); try { await window.workerPlus.openOutput(name); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  const completed = new Set(state?.context?.completed_steps || []); const current = state?.context?.current_step;
  const latestFailure = state?.context?.recovery_history?.at(-1);
  const terminalFailedStep = state?.context?.status === "failed" ? latestFailure?.failed_step : undefined;
  const percent = useMemo(() => Math.round(completed.size / STEPS.length * 100), [state]);

  return <main>
    <header><div><span className="eyebrow">DANESHYAR · DESKTOP WORKER</span><h1>Worker Plus</h1><p>کنترل اجرای سفارش‌ها، مرحله به مرحله</p></div><div className={`connection ${error ? "bad" : ""}`}><i />{error ? "خطا در ارتباط" : "آماده"}</div></header>
    <section className="search-card"><div className="searchbox"><Search size={20}/><input ref={searchInput} value={query} readOnly={false} disabled={false} onChange={e => { setQuery(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && lookup()} placeholder="لینک یا شناسه سفارش را وارد کنید…"/><button onClick={lookup} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : "پیدا کردن"}</button></div>{error && <div className="error"><CircleAlert size={17}/>{error}</div>}</section>

    {order ? <>
      <section className="order-head"><div><span className="tag">{value(order, "order_type")}</span><h2>{value(order, "title", "subject")}</h2><div className="order-id-row"><div className="muted ltr">{orderId}</div><button className="edit-order" onClick={() => { searchInput.current?.focus(); searchInput.current?.select(); }}><Pencil size={13}/> تغییر سفارش</button></div></div><div className="facts"><div className="status-fact"><span>وضعیت</span><b>{orderStatus(value(order, "status"))}</b><div className="status-tooltip"><strong>وضعیت‌های سفارش</strong>{Object.entries(ORDER_STATUS_DEFINITIONS).map(([key, definition]) => <div key={key} className={value(order, "status") === key ? "active" : ""}><i>{value(order, "status") === key && <Check size={13}/>}</i><span>{definition.label}</span></div>)}</div></div><div><span>تعداد / حجم</span><b>{value(order, "quantity", "quantity_value")}</b></div><div><span>آخرین اجرا</span><b>{runStatus(state?.context?.status)}</b></div></div></section>
      <div className="layout"><section className="panel timeline"><div className="panel-title"><div><h3>مراحل اجرا</h3><p>{completed.size} از {STEPS.length} مرحله انجام شده</p></div><strong>{percent.toLocaleString("fa-IR")}٪</strong></div><div className="progress"><i style={{width: `${percent}%`}}/></div>
        <div className="steps">{STEPS.map((step, index) => { const status = terminalFailedStep === step ? "failed" : completed.has(step) ? "done" : current === step ? "running" : "pending"; return <div className={`step ${status}`} key={step}><div className="step-number">{(index + 1).toLocaleString("fa-IR")}</div><div className="step-icon">{status === "failed" ? <CircleAlert/> : status === "done" ? <CircleCheck/> : status === "running" ? <LoaderCircle className="spin"/> : <CircleDashed/>}</div><div className="step-copy"><b>{labels[step]}</b><span>{step}</span></div><button disabled={Boolean(state?.running)} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, step: index + 1, note: operatorNote}))}><RotateCcw size={15}/> اجرا از اینجا</button></div>; })}</div>
      </section>
      <aside><section className="panel actions"><h3>اجرای سفارش</h3><label><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)}/><span><b>حالت آفلاین</b><small>بدون تغییر وضعیت backend</small></span></label><label><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)}/><span><b>خروجی نمونه</b><small>اجرای workflow در حالت sample</small></span></label>
        {latestFailure?.error && <div className="failure-box"><div><CircleAlert size={16}/><b>آخرین خطای ثبت‌شده</b></div><span>{latestFailure.failed_step ? `${labels[latestFailure.failed_step] || latestFailure.failed_step}: ` : ""}{latestFailure.error}</span>{latestFailure.restart_step && <small>شروع پیشنهادی سیستم: {labels[latestFailure.restart_step] || latestFailure.restart_step}</small>}</div>}
        <div className="note-field"><label htmlFor="operator-note">یادداشت برای AI</label><textarea id="operator-note" value={operatorNote} onChange={event => setOperatorNote(event.target.value)} placeholder="مثلاً علت خطا را بررسی کن، جدول‌ها را ساده‌تر بساز و محدودیت گزارش‌شده را رعایت کن…"/><small>این یادداشت همراه علت خطای قبلی به تمام مراحل AI در اجرای بعدی داده می‌شود.</small></div>
        <button className="primary" disabled={Boolean(state?.running)} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, note: operatorNote}))}><Play size={18}/> شروع اجرای کامل</button>
        <div className="button-row"><button disabled={Boolean(state?.running)} onClick={() => action(() => window.workerPlus.resumeRun(operatorNote))}><RotateCcw size={17}/> ادامه اجرا</button><button className="danger" disabled={!state?.running} onClick={() => action(() => window.workerPlus.stopRun())}><Square size={16}/> توقف</button></div>
        <div className="output-actions"><button className="ghost workspace-button" onClick={() => window.workerPlus.openWorkspace()}><ExternalLink size={17}/> باز کردن workspace</button><div className="output-grid">{(["sample.pdf", "sample.docx", "final.pdf", "final.docx"] as const).map(name => <button key={name} className={state?.outputs?.[name] === false ? "missing" : ""} title={`باز کردن ${name}`} onClick={() => openOutput(name)}><FileText size={15}/><span>{name}</span></button>)}</div></div>
      </section>
      </aside></div>
      <section className="panel console console-wide"><div className="console-title"><Terminal size={17}/><b>خروجی زنده</b><span>{state?.running ? "در حال اجرا" : "متوقف"}</span></div><pre>{logs || "هنوز خروجی‌ای ثبت نشده است."}</pre></section>
    </> : <section className="empty"><div><Search/><h2>یک سفارش را پیدا کنید</h2><p>لینک صفحه سفارش یا شناسه آن را در کادر بالا وارد کنید.</p></div></section>}
  </main>;
}
