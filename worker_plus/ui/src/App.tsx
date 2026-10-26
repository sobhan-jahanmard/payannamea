import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, CircleDashed, ExternalLink, FileText, LoaderCircle, Monitor, Play, RotateCcw, Search, Square, Terminal, Trash2, Upload } from "lucide-react";
import type { WorkerState, ArtifactRecord } from "./global";
import { ORDER_STATUS_DEFINITIONS } from "../../../frontend/src/lib/order-status";
import stageDefinitions from "../../common/stages.json";
import presentationLabels from "../../presentation/stages.json";
import { failureForContext, mergeRecoveryNote, recoveryNote, removeLegacyPresentationPlan, repairWasBlocked } from "./recovery";
import { ExecutionGraph } from "./ExecutionGraph";
import "./execution-graph.css";
import { PresentationPreview } from "./PresentationPreview";
import { AiReviewPanel } from "./AiReviewPanel";
import { OrderDetails } from "./OrderDetails";
import { DashboardAccordion } from "./DashboardAccordion";
import presentationCatalog from "../../../frontend/src/lib/presentation-catalog.json";

const STEPS = stageDefinitions.map(stage => stage.id);
const labels: Record<string, string> = Object.fromEntries(stageDefinitions.map(stage => [stage.id, stage.label]));
const currentStageId = (id?: string) => id === "05c_research" ? "05c_research_evidence" : id;
const artifactStatuses: Record<string, string> = { VALIDATED: "تأییدشده", STALE: "وابستگی منقضی", REVISION_REQUIRED: "نیازمند اصلاح", READY_FOR_VALIDATION: "منتظر اعتبارسنجی", VALIDATING: "در حال اعتبارسنجی" };
const artifactLabels: Record<string, string> = { order_snapshot: "نسخه سفارش", input_manifest: "ورودی‌ها", requirements: "الزامات محتوا", style_profile: "شیوه‌نامه", source_index: "نمایه منابع", research: "پژوهش و شواهد", validated_data: "داده آماده", analysis_results: "نتایج محاسبه‌شده", semantic_document: "مدل معنایی محتوا", visual_assets: "تصاویر", validated_docx: "Word تأییدشده", interim_reports: "گزارش‌های میانی", rendered_pdf: "PDF", sample_package: "نمونه", final_compliance: "انطباق نهایی" };

function value(order: Record<string, unknown> | null, ...keys: string[]) { for (const key of keys) if (order?.[key]) return String(order[key]); return "—"; }
const runStatuses: Record<string, string> = { starting: "در حال شروع", in_progress: "در حال انجام", dry_run_complete: "اجرای محلی کامل شد", completed: "انجام‌شده", failed: "ناموفق", paused: "متوقف موقت" };
const finishedStatuses = new Set(["dry_run_complete", "worker_done_pending_approval", "sample_pending_customer_approval", "completed"]);
function runStatus(status?: string) { return status ? ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || runStatuses[status] || status : "اجرا نشده"; }

export function App() {
  const searchInput = useRef<HTMLInputElement>(null);
  const manualSelection = useRef(false);
  const restoredActiveOrder = useRef(false);
  const publishingLocal = useRef(false);
  const [noteOwner, setNoteOwner] = useState("");
  const lastAutomaticNote = useRef("");
  const notesByOrder = useRef(new Map<string, { text: string; automatic: string }>());
  const [query, setQuery] = useState(""); const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Record<string, unknown> | null>(null); const [state, setState] = useState<WorkerState | null>(null);
  const [logs, setLogs] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [offline, setOffline] = useState(true); const [sample, setSample] = useState(false); const [operatorNote, setOperatorNote] = useState("");
  const [artifactFilter, setArtifactFilter] = useState<"current" | "all" | "issues">("current");
  const [notice, setNotice] = useState("");
  const [resetTarget, setResetTarget] = useState<{ orderId: string; workspace: string } | null>(null);
  const cancelResetButton = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => { setPreviewOpen(false); }, [orderId]);
  useEffect(() => {
    if (!resetTarget) return;
    cancelResetButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setResetTarget(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetTarget]);
  const operationBusy = busy || Boolean(state?.cleaning);
  const isResearch = order?.order_type === "تحقیق دانشگاهی";
  const isPresentation = order?.order_type === "ارائه و پاورپوینت";
  const outputNames = isPresentation ? ["final.pdf", "final.pptx", "sample.pdf", "sample.pptx"] as const : ["final.pdf", "final.docx", "sample.pdf", "sample.docx"] as const;
  const stageLabel = (id?: string) => {
    if (isPresentation && id && id in presentationLabels) return presentationLabels[id as keyof typeof presentationLabels];
    if (isResearch && id === "06_build_thesis_plan") return "طرح بخش‌های گزارش بر پایه شواهد";
    if (isResearch && id === "09c_package_interim_reports") return "بررسی نیاز به گزارش میانی";
    return id ? labels[id] || id : "—";
  };

  const applyState = (nextState: WorkerState) => { setState(nextState); setLogs(nextState.logs || ""); };
  const refresh = () => window.workerPlus.readState().then(next => { applyState(next); return next; });
  const restoreActiveOrder = (nextState: WorkerState) => {
    if (manualSelection.current || restoredActiveOrder.current) return;
    const context = nextState.context;
    if (!context?.order_id || !context.order || !Object.keys(context.order).length) return;
    restoredActiveOrder.current = true;
    setOrderId(context.order_id);
    setOrder({ ...context.order, status: context.order.status || context.status });
    setQuery(context.order_id);
    setSample(context.mode === "sample");
    setOperatorNote(finishedStatuses.has(context.status || "") ? "" : context.operator_note || "");
    if (typeof context.offline === "boolean") setOffline(context.offline);
    void window.workerPlus.lookupOrder(context.order_id).then(result => {
      setOrder(previous => previous && String(previous.id || context.order_id) === result.id ? result.order : previous);
    }).catch(() => {});
  };
  useEffect(() => {
    window.workerPlus.readState().then(next => { applyState(next); restoreActiveOrder(next); }); const unsubscribe = window.workerPlus.onEvent(event => {
      if (event.type === "log") setLogs(previous => (previous + String(event.value)).slice(-100_000));
      if (event.type === "state") { const next = event.value as WorkerState; applyState(next); restoreActiveOrder(next); }
      if (event.type === "exit") {
        const wasPublishing = publishingLocal.current;
        publishingLocal.current = false;
        refresh().then(async next => {
          if (next.context?.order_id) {
            try {
              const result = await window.workerPlus.lookupOrder(next.context.order_id);
              setOrder(previous => previous && String(previous.id || next.context?.order_id) === result.id ? result.order : previous);
            } catch { /* Local execution data remains available when the server cannot be reached. */ }
          }
          if (!wasPublishing) return;
          if (next.context?.status === "worker_done_pending_approval" || next.context?.status === "sample_pending_customer_approval") {
            setNotice("نسخهٔ محلی با موفقیت روی سرور ثبت شد.");
          } else setError("انتشار انجام نشد. جزئیات خطا را در گزارش فنی پایین صفحه ببینید.");
        }).catch(error => setError(error instanceof Error ? error.message : String(error)));
      }
    }); return unsubscribe;
  }, []);

  async function lookup() { if (operationBusy) return; setBusy(true); setError(""); setNotice(""); try { const result = await window.workerPlus.lookupOrder(query); manualSelection.current = true; setOrderId(result.id); setOrder(result.order); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function action(task: () => Promise<unknown>, clearLogs = true) { if (operationBusy) return; setBusy(true); setError(""); setNotice(""); if (clearLogs) setLogs(""); try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); await refresh().catch(() => {}); } finally { setBusy(false); } }
  async function publishLocal() {
    if (!localPackageReady || operationBusy || state?.running) return;
    publishingLocal.current = true;
    await action(async () => {
      try { await window.workerPlus.publishLocal(orderId); }
      catch (error) { publishingLocal.current = false; throw error; }
    });
  }
  async function openOutput(name: "sample.pdf" | "sample.pptx" | "sample.docx" | "final.pdf" | "final.pptx" | "final.docx" | "report_1.pdf" | "report_1.docx" | "report_2.pdf" | "report_2.docx" | "report_3.pdf" | "report_3.docx") { setError(""); try { await window.workerPlus.openOutput(name); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  const matchingOrder = state?.context?.order_id === orderId;
  async function resetLocalFiles() {
    const target = resetTarget;
    setResetTarget(null);
    if (!target || !state || !matchingOrder || state.workspace !== target.workspace || orderId !== target.orderId || state.running || operationBusy) {
      setError("وضعیت اجرای سفارش تغییر کرده است؛ دوباره دکمهٔ پاک‌سازی را بزنید.");
      return;
    }
    await action(async () => {
      const result = await window.workerPlus.resetRun(target);
      setOperatorNote(""); setArtifactFilter("current");
      setNotice(`${result.files_removed.toLocaleString("fa-IR")} فایل محلی پاک شد؛ می‌توانید سفارش را از ابتدا اجرا کنید.`);
    }, false);
  }
  const runContext = matchingOrder ? state?.context : undefined;
  const workflow = matchingOrder ? state?.workflow : undefined;
  const artifacts = workflow?.artifacts || [];
  const currentArtifacts = artifacts.filter(record => record.current && !record.kind.startsWith("failure_"));
  const visibleArtifacts = artifacts.filter(record => artifactFilter === "all" || (record.current && (artifactFilter === "current" ? !record.kind.startsWith("failure_") : record.status !== "VALIDATED")));
  const completed = new Set(matchingOrder ? state?.context?.completed_steps || [] : []);
  const finalPackageReady = completed.has("10_validate_and_publish") && (state?.context?.finalization_state === "FINALIZED" || finishedStatuses.has(state?.context?.status || ""));
  const localPackageReady = matchingOrder && finalPackageReady && runContext?.status === "dry_run_complete" && outputNames.every(name => state?.outputs?.[name]);
  const savedCurrent = matchingOrder ? state?.context?.current_step : undefined;
  const current = state?.running ? savedCurrent : undefined;
  const interruptedStep = !state?.running && state?.context?.status === "in_progress" ? savedCurrent : undefined;
  const displayedRunStatus = !matchingOrder ? "اجرا نشده" : state?.running ? "در حال انجام" : interruptedStep ? "متوقف / قطع‌شده" : runStatus(state?.context?.status);
  const latestFailure = matchingOrder && !finalPackageReady ? failureForContext(runContext) : undefined;
  const previousCodeRepair = matchingOrder && state?.autoRepair?.order_id === orderId && !state?.running ? state.autoRepair : undefined;
  const codeRepair = previousCodeRepair && repairWasBlocked(previousCodeRepair.status, previousCodeRepair.reason) ? { ...previousCodeRepair, status: "blocked" as const } : previousCodeRepair;
  const problemStep = !state?.running && (state?.context?.status === "paused" || state?.context?.status === "failed") ? currentStageId(latestFailure?.failed_step) : undefined;
  const suggestedIndex = latestFailure?.restart_step ? STEPS.indexOf(currentStageId(latestFailure.restart_step) || "") : -1;
  const automaticRecovery = recoveryNote(latestFailure, isPresentation);
  useEffect(() => {
    if (!orderId) return;
    const changedOrder = noteOwner !== orderId;
    if (changedOrder && noteOwner) notesByOrder.current.set(noteOwner, { text: operatorNote, automatic: lastAutomaticNote.current });
    if (finalPackageReady && !state?.running) {
      notesByOrder.current.set(orderId, { text: "", automatic: "" });
      setOperatorNote("");
      setError("");
      setNoteOwner(orderId);
      lastAutomaticNote.current = "";
      return;
    }
    const saved = changedOrder ? notesByOrder.current.get(orderId) : undefined;
    const previousAutomatic = changedOrder ? saved?.automatic || latestFailure?.repair_note || "" : lastAutomaticNote.current;
    const initial = saved?.text ?? runContext?.operator_note ?? "";
    // Older presentation sessions saved the generic automatic research plan as
    // if it were manual guidance. Replace that exact generated plan on restore.
    setOperatorNote(previous => {
      const text = changedOrder ? initial : previous;
      return mergeRecoveryNote(isPresentation ? removeLegacyPresentationPlan(text, latestFailure) : text, automaticRecovery, previousAutomatic);
    });
    setNoteOwner(orderId);
    lastAutomaticNote.current = automaticRecovery;
  }, [orderId, automaticRecovery, finalPackageReady, state?.running]);
  const currentOperatorNote = noteOwner === orderId ? operatorNote : "";
  async function runSuggestedStage() {
    if (suggestedIndex < 0 || !matchingOrder) return;
    const note = mergeRecoveryNote(currentOperatorNote, automaticRecovery);
    setOperatorNote(note);
    await action(() => window.workerPlus.startRun({ orderId, offline, sample, step: suggestedIndex + 1, note, autoRepair: true }));
  }
  const percent = useMemo(() => Math.round(completed.size / STEPS.length * 100), [state, orderId]);
  async function openArtifact(record: ArtifactRecord, report = false) { const file = report ? record.validation?.report_path : record.files[0]?.snapshot; if (file) await action(() => window.workerPlus.openArtifact(file), false); }

  return <main className="app-with-graph">
    {resetTarget && <div className="reset-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setResetTarget(null); }}><div className="reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description" dir="rtl"><div className="reset-dialog-icon"><Trash2 size={21}/></div><h2 id="reset-dialog-title">پاک‌سازی اجرای محلی؟</h2><p id="reset-dialog-description">همهٔ فایل‌ها، خروجی‌ها و تاریخچهٔ اجرای فعلی این سفارش از این دستگاه حذف می‌شوند. این کار قابل بازگشت نیست.</p><p className="reset-dialog-order">سفارش: <bdi>{resetTarget.orderId}</bdi></p><small>سفارش ثبت‌شده در سرور و اجراهای دیگر حذف نمی‌شوند.</small><div className="reset-dialog-actions"><button ref={cancelResetButton} type="button" className="ghost" onClick={() => setResetTarget(null)}>لغو</button><button type="button" className="danger" onClick={resetLocalFiles}><Trash2 size={16}/> حذف فایل‌ها و بازنشانی</button></div></div></div>}
    {previewOpen && <PresentationPreview key={orderId} orderId={orderId} onClose={() => setPreviewOpen(false)}/>}
    <header><div><span className="eyebrow">DANESHYAR · DESKTOP WORKER</span><h1>Daneshyar</h1><p>کنترل اجرای سفارش‌ها، مرحله به مرحله</p></div><div className="header-tools">{typeof window.workerPlus.toggleDesktopWidget === "function" && <button type="button" className="desktop-widget-button" aria-pressed={state?.desktopWidgetVisible !== false} onClick={() => action(() => window.workerPlus.toggleDesktopWidget(), false)}><Monitor size={17}/> ویجت دسکتاپ</button>}<div className={`connection ${error ? "bad" : ""}`}><i />{error ? "خطا در ارتباط" : "آماده"}</div></div></header>
    <section className="search-card"><div className="searchbox"><Search size={20}/><input ref={searchInput} value={query} readOnly={false} disabled={false} onChange={e => { setQuery(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && lookup()} placeholder="لینک یا شناسه سفارش را وارد کنید…"/><button onClick={lookup} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : "پیدا کردن"}</button></div>{error && <div className="error"><CircleAlert size={17}/>{error}</div>}</section>

    {order ? <>
      <DashboardAccordion key={`order-${orderId}`} title="مشخصات سفارش و هزینه" className="order-accordion"><OrderDetails order={order} orderId={orderId} runStatus={displayedRunStatus} liveUsage={runContext?.usage} onChangeOrder={() => { searchInput.current?.focus(); searchInput.current?.select(); }}/></DashboardAccordion>
      <DashboardAccordion key={`run-${orderId}`} title="اجرای سفارش" className="run-accordion"><section className="panel actions run-panel"><h3>اجرای سفارش</h3><div className="run-panel-grid"><div className="run-panel-context">
        {isPresentation && <div className="presentation-options-summary"><p>سبک: {presentationCatalog.styles.find(style => style.id === order.presentation_style)?.label || "دانشگاهی مدرن"} · فونت: {value(order, "presentation_font") === "—" ? "Vazirmatn" : value(order, "presentation_font")}</p><button disabled={!matchingOrder || !state?.outputs?.["final.pptx"] || operationBusy} onClick={() => setPreviewOpen(true)}>پیش‌نمایش اسلاید و یادداشت مطالعه</button></div>}
        {finalPackageReady && <div className="completed-output" role="status"><div className="completed-output-title"><CircleCheck size={19}/><b>فایل‌های نهایی آماده‌اند</b></div><p>{runContext?.status === "dry_run_complete" ? "اجرای محلی کامل شد. فایل‌ها روی همین دستگاه ذخیره شده‌اند و وضعیت سفارش در سرور تغییر نکرده است." : "اجرای این سفارش کامل شد. فایل‌های خروجی را از اینجا باز کنید."}</p><div className="output-grid">{outputNames.map(name => { const artifact = currentArtifacts.find(record => record.kind === (name.startsWith("sample") ? "sample_package" : "rendered_pdf")); const available = !operationBusy && Boolean(state?.outputs?.[name]) && (!workflow || artifact?.status === "VALIDATED"); return <button key={name} disabled={!available} className={available ? "" : "missing"} onClick={() => openOutput(name)}><FileText size={15}/><span>{name}</span></button>; })}</div>{runContext?.status === "dry_run_complete" && <><button className="publish-local-button" disabled={!localPackageReady || operationBusy || Boolean(state?.running)} onClick={publishLocal}><Upload size={16}/> انتشار نسخهٔ محلی</button><small className="publish-local-hint">فایل‌های همین پوشه بدون بازسازی یا اجرای AI ارسال می‌شوند. اگر فایلی را ویرایش کرده‌اید، هماهنگی نسخهٔ قابل‌ویرایش و PDF را بررسی کنید.</small></>}<button className="ghost final-folder-button" disabled={operationBusy} onClick={() => action(() => window.workerPlus.openFinalFolder(), false)}><ExternalLink size={16}/> باز کردن پوشهٔ فایل‌های نهایی</button><small className="final-path ltr">{state?.workspace ? `${state.workspace}\\final` : ""}</small></div>}
        <label><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)}/><span><b>بدون ثبت در سرور</b><small>پژوهش وب همچنان انجام می‌شود؛ وضعیت سفارش در backend تغییر نمی‌کند</small></span></label><label><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)}/><span><b>خروجی نمونه</b><small>اجرای workflow در حالت sample</small></span></label>
        {runContext?.pause_reason && !latestFailure && !finalPackageReady && <div className="failure-box"><b>نیازمند رسیدگی</b><span>{runContext.pause_reason}</span></div>}
        {runContext?.research && <div className="info-box"><b>شواهد پژوهش وب</b><span>{runContext.research.total.toLocaleString("fa-IR")} خروجی · {runContext.research.sourceCount.toLocaleString("fa-IR")} منبع ثبت‌شده</span><small>{isResearch ? "مستقیم" : "ایران/مستقیم"}: {runContext.research.direct.toLocaleString("fa-IR")} · جانشین خارجی/زمینه‌ای: {runContext.research.proxy.toLocaleString("fa-IR")} · فرض طراحی: {runContext.research.assumption.toLocaleString("fa-IR")}</small><button className="ghost" onClick={() => action(() => window.workerPlus.openReport("research/evidence.json"), false)}><FileText size={15}/> باز کردن شواهد و منابع</button><button className="ghost" onClick={() => action(() => window.workerPlus.openReport("research/analysis.md"), false)}><FileText size={15}/> باز کردن محاسبات انجام‌شده</button></div>}
        {latestFailure?.error && <div className="failure-box"><div><CircleAlert size={16}/><b>{state?.running ? "در حال اصلاح خطا" : "اجرای متوقف‌شده؛ قابل‌ادامه"}</b></div><span>مرحلهٔ خطا: {stageLabel(latestFailure.failed_step)}</span><span>{latestFailure.error}</span>{Boolean(latestFailure.issues?.length) && <div className="failure-details"><b>علت دقیق توقف</b><ul>{latestFailure.issues!.map((item, index) => <li key={index}><p>{item.message}</p>{item.location && <small>محل: <bdi>{item.location}</bdi></small>}<code>{item.code}</code></li>)}</ul></div>}<small>شروع پیشنهادی: {stageLabel(latestFailure.restart_step)}</small><small>خطا و یادداشت شما همراه سابقهٔ تلاش‌های این سفارش بررسی می‌شوند. اصلاح کد فقط پس از آزمون اعمال می‌شود؛ سپس اجرا از مرحلهٔ پیشنهادی ادامه می‌یابد.</small>{latestFailure.report_path && <><small className="ltr">{latestFailure.report_path}</small><button className="ghost" onClick={() => action(() => window.workerPlus.openReport(latestFailure.report_path! ), false)}><FileText size={15}/> باز کردن گزارش خطا</button></>}{!state?.running && suggestedIndex >= 0 && state?.context?.order_id === orderId && <button disabled={operationBusy} onClick={runSuggestedStage}><RotateCcw size={15}/> اصلاح و ادامه از مرحلهٔ پیشنهادی</button>}</div>}
        {codeRepair && <div className={`auto-repair-status ${codeRepair.status}`} role="status"><b>آخرین بررسی خودکار کد: {codeRepair.status === "blocked" ? "بررسی اصلاح مسدود شد" : codeRepair.status === "applied" ? "اصلاح آزموده اعمال شد" : codeRepair.status === "no_code_change" ? "تغییر کد لازم نبود" : codeRepair.status === "rejected" ? "اصلاح پیشنهادی پذیرفته نشد" : "اصلاح کد انجام نشد"}</b>{["blocked", "rejected", "skipped"].includes(codeRepair.status) && <p>عامل نتوانست بررسی و اصلاح را کامل کند. جزئیات مانع در گزارش ثبت شده است.</p>}{Boolean(codeRepair.files?.length) && <small dir="ltr">{codeRepair.files!.join("، ")}</small>}{codeRepair.reason && <details><summary>جزئیات بررسی</summary><p dir="auto">{codeRepair.reason}</p></details>}<button type="button" className="ghost" onClick={() => action(() => window.workerPlus.openReport("reports/stage_checks/auto_code_repair.json"), false)}><FileText size={15}/> گزارش اصلاح کد</button></div>}
        {interruptedStep && <div className="interrupted-box"><CircleAlert size={16}/><span>هیچ پردازشی فعال نیست؛ اجرای قبلی هنگام «{stageLabel(interruptedStep)}» قطع شده است.</span></div>}
        <div className="note-field"><label htmlFor="operator-note">یادداشت برای AI</label><textarea id="operator-note" rows={automaticRecovery ? 10 : 4} value={currentOperatorNote} onChange={event => setOperatorNote(event.target.value)} placeholder="دستور تکمیلی برای اجرای این مرحله…"/><small>با «اصلاح و ادامه»، خطا و این یادداشت به گفت‌وگوی همان مرحله می‌رسند. تلاش‌های قبلی در گراف قابل بررسی‌اند.</small></div>
        </div><div className="run-panel-controls"><button className="primary" disabled={operationBusy || Boolean(state?.running)} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, note: currentOperatorNote}))}><Play size={18}/> شروع اجرای کامل</button>
        <div className="button-row"><button disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={() => action(() => window.workerPlus.resumeRun(currentOperatorNote))}><RotateCcw size={17}/> ادامه اجرا</button><button className="danger" disabled={operationBusy || !state?.running} onClick={() => action(() => window.workerPlus.stopRun(), false)}><Square size={16}/> توقف</button></div>
        <div className="cleanup-controls"><button type="button" className="ghost cleanup-button" dir="ltr" disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={() => { if (state && matchingOrder) setResetTarget({ orderId, workspace: state.workspace }); }}>{state?.cleaning ? <LoaderCircle className="spin" size={17}/> : <Trash2 size={17}/>} reset and cleanup</button><small>فایل‌ها و تاریخچهٔ اجرای فعلی روی همین دستگاه حذف می‌شوند. اجراهای دیگر و سفارش سرور حفظ می‌شوند.</small>{notice && <p className="cleanup-notice" role="status">{notice}</p>}</div>
        {!finalPackageReady && <div className="output-actions"><button className="ghost workspace-button" disabled={operationBusy || !matchingOrder} onClick={() => window.workerPlus.openWorkspace()}><ExternalLink size={17}/> باز کردن workspace</button>{matchingOrder && outputNames.some(name => state?.outputs?.[name]) && <small>فایل‌های موجود از اجرای قبلی‌اند؛ بستهٔ این اجرا هنوز تأیید و آمادهٔ تحویل نشده است.</small>}</div>}
        {completed.has("09c_package_interim_reports") && (["report_1.pdf", "report_2.pdf", "report_3.pdf"] as const).some(name => state?.outputs?.[name]) && <div className="output-actions"><b>گزارش‌های میانی</b><div className="output-grid">{(["report_1.pdf", "report_1.docx", "report_2.pdf", "report_2.docx", "report_3.pdf", "report_3.docx"] as const).map(name => { const available = matchingOrder && !operationBusy && Boolean(state?.outputs?.[name]); return <button key={name} disabled={!available} className={available ? "" : "missing"} onClick={() => openOutput(name)}><FileText size={15}/><span>{name}</span></button>; })}</div></div>}
      </div></div></section></DashboardAccordion>

      <DashboardAccordion key={`review-${orderId}`} title="بازبینی توسط هوش مصنوعی" className="review-accordion"><AiReviewPanel key={orderId} orderId={orderId} /></DashboardAccordion>
      <DashboardAccordion key={`workflow-${orderId}`} title="مراحل اجرا و مسیر واقعی" className="workflow-accordion"><section className="panel workflow-overview"><h3>مراحل اجرا و مسیر واقعی</h3><div className="layout run-layout"><ExecutionGraph trace={runContext?.execution_trace} orderId={orderId} running={Boolean(state?.running && matchingOrder)} labelFor={stageLabel} disabled={operationBusy} onOpen={relativePath => action(() => window.workerPlus.openReport(relativePath || "reports/execution_graph.json"), false)}/><section className="panel timeline"><div className="panel-title"><div><h3>مراحل اجرا</h3><p>{completed.size} از {STEPS.length} مرحله انجام شده</p></div><strong>{percent.toLocaleString("fa-IR")}٪</strong></div><div className="progress"><i style={{width: `${percent}%`}}/></div>
        <div className="steps">{STEPS.map((step, index) => { const outputs = currentArtifacts.filter(record => stageDefinitions[index].produces.includes(record.kind)); const stale = outputs.some(record => record.status === "STALE"); const status = problemStep === step ? "failed" : current === step ? "running" : stale ? "stale" : completed.has(step) ? "done" : "pending"; return <div className={`step ${status}`} key={step}><div className="step-number">{(index + 1).toLocaleString("fa-IR")}</div><div className="step-icon">{status === "failed" || status === "stale" ? <CircleAlert/> : status === "done" ? <CircleCheck/> : status === "running" ? <LoaderCircle className="spin"/> : <CircleDashed/>}</div><div className="step-copy"><b>{stageLabel(step)}</b><span>{outputs.length ? outputs.map(record => `v${record.version} · ${artifactStatuses[record.status] || record.status}`).join(" / ") : step}</span></div><button disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, step: index + 1, note: currentOperatorNote}))}><RotateCcw size={15}/> اجرا از اینجا</button></div>; })}</div>
      </section>
      </div></section></DashboardAccordion>
      {workflow && <DashboardAccordion key={`artifacts-${orderId}`} title="خروجی‌ها و شواهد اجرا" className="artifacts-accordion"><section className="panel artifacts-panel"><div className="artifact-header"><div><h3>خروجی‌ها و شواهد اجرا</h3><p>{currentArtifacts.filter(record => record.status === "VALIDATED").length.toLocaleString("fa-IR")} خروجی تأییدشده · {currentArtifacts.filter(record => record.status === "STALE").length.toLocaleString("fa-IR")} وابستگی منقضی</p></div><div className="artifact-filters">{([ ["current", "نسخه‌های جاری"], ["all", "تاریخچه نسخه‌ها"], ["issues", "نیازمند رسیدگی"] ] as const).map(([key, title]) => <button key={key} aria-pressed={artifactFilter === key} className={artifactFilter === key ? "active" : ""} onClick={() => setArtifactFilter(key)}>{title}</button>)}</div></div>
        <div className="artifact-table-wrap"><table className="artifact-table"><thead><tr><th>خروجی مرحله</th><th>نسخه</th><th>اعتبارسنجی</th><th>وابستگی‌ها</th><th>فایل و گزارش</th></tr></thead><tbody>{visibleArtifacts.map(record => <tr key={record.id} className={record.current ? "" : "historical"}><td><b>{artifactLabels[record.kind] || labels[record.stage] || record.kind}</b><small>{record.current ? "نسخه جاری" : "نسخه تاریخی"} · {record.files.length.toLocaleString("fa-IR")} فایل</small>{record.validation?.issues.slice(0, 3).map((item, index) => <div className="artifact-issue" key={index}><code>{item.code}</code><span>{item.message}</span></div>)}</td><td className="version">v{record.version}</td><td><span className={`artifact-badge ${record.status.toLowerCase()}`}>{artifactStatuses[record.status] || record.status}</span></td><td><div className="dependency-list">{record.upstream.length ? record.upstream.map(parent => <span key={parent.id} title={parent.id}>{artifactLabels[parent.kind] || parent.kind} · v{parent.version}</span>) : <span>ورودی مستقل</span>}</div></td><td><div className="artifact-links"><button disabled={operationBusy} onClick={() => openArtifact(record)}><FileText size={14}/> فایل</button>{record.validation && <button disabled={operationBusy} onClick={() => openArtifact(record, true)}>گزارش</button>}</div></td></tr>)}</tbody></table>{!visibleArtifacts.length && <p className="artifact-empty">{artifactFilter === "issues" ? "خروجی نیازمند رسیدگی وجود ندارد." : "خروجی این اجرا هنوز ثبت نشده است."}</p>}</div>
        {matchingOrder && state?.context?.finalization_state && <div className={`finalization ${state.context.finalization_state === "FINALIZED" ? "passed" : ""}`}><CircleCheck size={17}/>{state.context.finalization_state === "FINALIZED" ? "کنترل نهایی انطباق پاس شده؛ بسته آمادهٔ تحویل و بررسی انسانی است." : "کنترل نهایی هنوز پاس نشده است."}</div>}
      </section></DashboardAccordion>}
      <DashboardAccordion key={`terminal-${orderId}`} title={finalPackageReady ? "گزارش فنی اجرای کامل‌شده" : "خروجی زنده"} className="console-accordion"><section className="panel console console-wide"><div className="console-title"><Terminal size={17}/><span>{finalPackageReady ? "اجرای کامل‌شده" : matchingOrder && state?.running ? "در حال اجرا" : "متوقف"}</span></div><pre>{finalPackageReady ? logs || "گزارش این اجرا در این نشست موجود نیست." : matchingOrder ? logs || (interruptedStep ? `پردازش فعالی پیدا نشد. آخرین اجرای ذخیره‌شده هنگام مرحله ${stageLabel(interruptedStep)} قطع شده است.` : "هنوز خروجی‌ای ثبت نشده است.") : "هنوز اجرایی برای این سفارش انتخاب نشده است."}</pre></section></DashboardAccordion>
    </> : <section className="empty"><div><Search/><h2>یک سفارش را پیدا کنید</h2><p>لینک صفحه سفارش یا شناسه آن را در کادر بالا وارد کنید.</p></div></section>}
  </main>;
}
