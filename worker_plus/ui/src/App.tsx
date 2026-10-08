import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, CircleCheck, CircleDashed, ExternalLink, FileText, LoaderCircle, Pencil, Play, RotateCcw, Search, Square, Terminal, Trash2 } from "lucide-react";
import type { WorkerState, ArtifactRecord } from "./global";
import { ORDER_STATUS_DEFINITIONS } from "../../../frontend/src/lib/order-status";
import stageDefinitions from "../../common/stages.json";
import { mergeRecoveryNote, recoveryNote } from "./recovery";

const STEPS = stageDefinitions.map(stage => stage.id);
const labels: Record<string, string> = Object.fromEntries(stageDefinitions.map(stage => [stage.id, stage.label]));
const artifactStatuses: Record<string, string> = { VALIDATED: "تأییدشده", STALE: "وابستگی منقضی", REVISION_REQUIRED: "نیازمند اصلاح", READY_FOR_VALIDATION: "منتظر اعتبارسنجی", VALIDATING: "در حال اعتبارسنجی" };
const artifactLabels: Record<string, string> = { order_snapshot: "نسخه سفارش", input_manifest: "ورودی‌ها", requirements: "الزامات محتوا", style_profile: "شیوه‌نامه", source_index: "نمایه منابع", research: "پژوهش و شواهد", validated_data: "داده آماده", analysis_results: "نتایج محاسبه‌شده", semantic_document: "مدل معنایی محتوا", visual_assets: "تصاویر", validated_docx: "Word تأییدشده", rendered_pdf: "PDF", sample_package: "نمونه", final_compliance: "انطباق نهایی" };

function value(order: Record<string, unknown> | null, ...keys: string[]) { for (const key of keys) if (order?.[key]) return String(order[key]); return "—"; }
const runStatuses: Record<string, string> = { starting: "در حال شروع", in_progress: "در حال انجام", completed: "انجام‌شده", failed: "ناموفق", paused: "متوقف موقت" };
function orderStatus(status: string) { return ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || runStatuses[status] || status || "—"; }
function runStatus(status?: string) { return status ? ORDER_STATUS_DEFINITIONS[status as keyof typeof ORDER_STATUS_DEFINITIONS]?.label || runStatuses[status] || status : "اجرا نشده"; }

export function App() {
  const searchInput = useRef<HTMLInputElement>(null);
  const manualSelection = useRef(false);
  const restoredActiveOrder = useRef(false);
  const [noteOwner, setNoteOwner] = useState("");
  const lastAutomaticNote = useRef("");
  const notesByOrder = useRef(new Map<string, { text: string; automatic: string }>());
  const [query, setQuery] = useState(""); const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Record<string, unknown> | null>(null); const [state, setState] = useState<WorkerState | null>(null);
  const [logs, setLogs] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [offline, setOffline] = useState(true); const [sample, setSample] = useState(false); const [operatorNote, setOperatorNote] = useState("");
  const [artifactFilter, setArtifactFilter] = useState<"current" | "all" | "issues">("current");
  const [notice, setNotice] = useState("");
  const operationBusy = busy || Boolean(state?.cleaning);

  const applyState = (nextState: WorkerState) => { setState(nextState); setLogs(nextState.logs || ""); };
  const refresh = () => window.workerPlus.readState().then(applyState);
  const restoreActiveOrder = (nextState: WorkerState) => {
    if (manualSelection.current || restoredActiveOrder.current) return;
    const context = nextState.context;
    if (!context?.order_id || !context.order || !Object.keys(context.order).length) return;
    if (!nextState.running && !["starting", "in_progress", "paused", "failed"].includes(context.status || "")) return;
    restoredActiveOrder.current = true;
    setOrderId(context.order_id);
    setOrder({ ...context.order, status: context.order.status || context.status });
    setQuery(context.order_id);
    setSample(context.mode === "sample");
    setOperatorNote(context.operator_note || "");
    if (typeof context.offline === "boolean") setOffline(context.offline);
  };
  useEffect(() => {
    window.workerPlus.readState().then(next => { applyState(next); restoreActiveOrder(next); }); const unsubscribe = window.workerPlus.onEvent(event => {
      if (event.type === "log") setLogs(previous => (previous + String(event.value)).slice(-100_000));
      if (event.type === "state") { const next = event.value as WorkerState; applyState(next); restoreActiveOrder(next); } if (event.type === "exit") refresh();
    }); return unsubscribe;
  }, []);

  async function lookup() { if (operationBusy) return; setBusy(true); setError(""); setNotice(""); try { const result = await window.workerPlus.lookupOrder(query); manualSelection.current = true; setOrderId(result.id); setOrder(result.order); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function action(task: () => Promise<unknown>, clearLogs = true) { if (operationBusy) return; setBusy(true); setError(""); setNotice(""); if (clearLogs) setLogs(""); try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); await refresh().catch(() => {}); } finally { setBusy(false); } }
  async function openOutput(name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx") { setError(""); try { await window.workerPlus.openOutput(name); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  const matchingOrder = state?.context?.order_id === orderId;
  async function resetLocalFiles() {
    if (!state || !matchingOrder) return;
    await action(async () => {
      const result = await window.workerPlus.resetRun({ orderId, workspace: state.workspace });
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
  const savedCurrent = matchingOrder ? state?.context?.current_step : undefined;
  const current = state?.running ? savedCurrent : undefined;
  const interruptedStep = !state?.running && state?.context?.status === "in_progress" ? savedCurrent : undefined;
  const displayedRunStatus = !matchingOrder ? "اجرا نشده" : state?.running ? "در حال انجام" : interruptedStep ? "متوقف / قطع‌شده" : runStatus(state?.context?.status);
  const latestFailure = matchingOrder ? state?.context?.active_failure || (state?.context?.status === "paused" || state?.context?.status === "failed" ? state?.context?.recovery_history?.at(-1) : undefined) : undefined;
  const problemStep = !state?.running && (state?.context?.status === "paused" || state?.context?.status === "failed") ? latestFailure?.failed_step : undefined;
  const suggestedIndex = latestFailure?.restart_step ? STEPS.indexOf(latestFailure.restart_step) : -1;
  const automaticRecovery = recoveryNote(latestFailure);
  useEffect(() => {
    if (!orderId) return;
    const changedOrder = noteOwner !== orderId;
    if (changedOrder && noteOwner) notesByOrder.current.set(noteOwner, { text: operatorNote, automatic: lastAutomaticNote.current });
    const saved = changedOrder ? notesByOrder.current.get(orderId) : undefined;
    const previousAutomatic = changedOrder ? saved?.automatic || latestFailure?.repair_note || "" : lastAutomaticNote.current;
    const initial = saved?.text ?? runContext?.operator_note ?? "";
    setOperatorNote(previous => mergeRecoveryNote(changedOrder ? initial : previous, automaticRecovery, previousAutomatic));
    setNoteOwner(orderId);
    lastAutomaticNote.current = automaticRecovery;
  }, [orderId, automaticRecovery]);
  const currentOperatorNote = noteOwner === orderId ? operatorNote : "";
  async function runSuggestedStage() {
    if (suggestedIndex < 0 || !matchingOrder) return;
    const note = mergeRecoveryNote(currentOperatorNote, automaticRecovery);
    setOperatorNote(note);
    await action(() => window.workerPlus.startRun({ orderId, offline, sample, step: suggestedIndex + 1, note }));
  }
  const percent = useMemo(() => Math.round(completed.size / STEPS.length * 100), [state, orderId]);
  async function openArtifact(record: ArtifactRecord, report = false) { const file = report ? record.validation?.report_path : record.files[0]?.snapshot; if (file) await action(() => window.workerPlus.openArtifact(file), false); }

  return <main>
    <header><div><span className="eyebrow">DANESHYAR · DESKTOP WORKER</span><h1>Daneshyar</h1><p>کنترل اجرای سفارش‌ها، مرحله به مرحله</p></div><div className={`connection ${error ? "bad" : ""}`}><i />{error ? "خطا در ارتباط" : "آماده"}</div></header>
    <section className="search-card"><div className="searchbox"><Search size={20}/><input ref={searchInput} value={query} readOnly={false} disabled={false} onChange={e => { setQuery(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && lookup()} placeholder="لینک یا شناسه سفارش را وارد کنید…"/><button onClick={lookup} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : "پیدا کردن"}</button></div>{error && <div className="error"><CircleAlert size={17}/>{error}</div>}</section>

    {order ? <>
      <section className="order-head"><div><span className="tag">{value(order, "order_type")}</span><h2>{value(order, "title", "subject")}</h2><div className="order-id-row"><div className="muted ltr">{orderId}</div><button className="edit-order" onClick={() => { searchInput.current?.focus(); searchInput.current?.select(); }}><Pencil size={13}/> تغییر سفارش</button></div></div><div className="facts"><div className="status-fact"><span>وضعیت</span><b>{orderStatus(value(order, "status"))}</b><div className="status-tooltip"><strong>وضعیت‌های سفارش</strong>{Object.entries(ORDER_STATUS_DEFINITIONS).map(([key, definition]) => <div key={key} className={value(order, "status") === key ? "active" : ""}><i>{value(order, "status") === key && <Check size={13}/>}</i><span>{definition.label}</span></div>)}</div></div><div><span>تعداد / حجم</span><b>{value(order, "quantity", "quantity_value")}</b></div><div><span>آخرین اجرا</span><b>{displayedRunStatus}</b></div></div></section>
      <div className="layout"><section className="panel timeline"><div className="panel-title"><div><h3>مراحل اجرا</h3><p>{completed.size} از {STEPS.length} مرحله انجام شده</p></div><strong>{percent.toLocaleString("fa-IR")}٪</strong></div><div className="progress"><i style={{width: `${percent}%`}}/></div>
        <div className="steps">{STEPS.map((step, index) => { const outputs = currentArtifacts.filter(record => stageDefinitions[index].produces.includes(record.kind)); const stale = outputs.some(record => record.status === "STALE"); const status = problemStep === step ? "failed" : current === step ? "running" : stale ? "stale" : completed.has(step) ? "done" : "pending"; return <div className={`step ${status}`} key={step}><div className="step-number">{(index + 1).toLocaleString("fa-IR")}</div><div className="step-icon">{status === "failed" || status === "stale" ? <CircleAlert/> : status === "done" ? <CircleCheck/> : status === "running" ? <LoaderCircle className="spin"/> : <CircleDashed/>}</div><div className="step-copy"><b>{labels[step]}</b><span>{outputs.length ? outputs.map(record => `v${record.version} · ${artifactStatuses[record.status] || record.status}`).join(" / ") : step}</span></div><button disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, step: index + 1, note: currentOperatorNote}))}><RotateCcw size={15}/> اجرا از اینجا</button></div>; })}</div>
      </section>
      <aside><section className="panel actions"><h3>اجرای سفارش</h3><label><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)}/><span><b>حالت آفلاین</b><small>بدون تغییر وضعیت backend</small></span></label><label><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)}/><span><b>خروجی نمونه</b><small>اجرای workflow در حالت sample</small></span></label>
        {runContext?.pause_reason && !latestFailure && <div className="failure-box"><b>نیازمند رسیدگی</b><span>{runContext.pause_reason}</span></div>}
        {runContext?.usage && <div className="failure-box"><b>مصرف ثبت‌شده سفارش</b><span>{runContext.usage.calls.toLocaleString("fa-IR")} فراخوانی · {runContext.usage.totalTokens.toLocaleString("fa-IR")} توکن</span><small>توکن cache: {runContext.usage.cachedInputTokens.toLocaleString("fa-IR")} · مصرف نامشخص: {runContext.usage.unknown_usage_calls.toLocaleString("fa-IR")} فراخوانی</small></div>}
        {latestFailure?.error && <div className="failure-box"><div><CircleAlert size={16}/><b>{state?.running ? "در حال اصلاح خطا" : "اجرای متوقف‌شده؛ قابل‌ادامه"}</b></div><span>مرحلهٔ خطا: {labels[latestFailure.failed_step] || latestFailure.failed_step}</span><span>{latestFailure.error}</span>{Boolean(latestFailure.issues?.length) && <div className="failure-details"><b>علت دقیق توقف</b><ul>{latestFailure.issues!.map((item, index) => <li key={index}><p>{item.message}</p>{item.location && <small>محل: <bdi>{item.location}</bdi></small>}<code>{item.code}</code></li>)}</ul></div>}<small>شروع پیشنهادی: {labels[latestFailure.restart_step] || latestFailure.restart_step}</small><small>راهکار اصلاح در یادداشت AI آماده است؛ با اجرای مرحلهٔ پیشنهادی اعمال می‌شود.</small>{latestFailure.report_path && <><small className="ltr">{latestFailure.report_path}</small><button className="ghost" onClick={() => action(() => window.workerPlus.openReport(latestFailure.report_path! ), false)}><FileText size={15}/> باز کردن گزارش خطا</button></>}{!state?.running && suggestedIndex >= 0 && state?.context?.order_id === orderId && <button disabled={operationBusy} onClick={runSuggestedStage}><RotateCcw size={15}/> اجرا از مرحلهٔ پیشنهادی</button>}</div>}
        {interruptedStep && <div className="interrupted-box"><CircleAlert size={16}/><span>هیچ پردازشی فعال نیست؛ اجرای قبلی هنگام «{labels[interruptedStep] || interruptedStep}» قطع شده است.</span></div>}
        <div className="note-field"><label htmlFor="operator-note">یادداشت برای AI</label><textarea id="operator-note" rows={automaticRecovery ? 10 : 4} value={currentOperatorNote} onChange={event => setOperatorNote(event.target.value)} placeholder="دستور تکمیلی برای اجرای این مرحله…"/><small>راهکار اصلاح خطا خودکار اینجا نوشته می‌شود. با اجرای مرحلهٔ پیشنهادی، راهکار و یادداشت شما به همان مرحله می‌رسند؛ کارهای تأییدشدهٔ قبلی حفظ می‌شوند.</small></div>
        <button className="primary" disabled={operationBusy || Boolean(state?.running)} onClick={() => action(() => window.workerPlus.startRun({orderId, offline, sample, note: currentOperatorNote}))}><Play size={18}/> شروع اجرای کامل</button>
        <div className="button-row"><button disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={() => action(() => window.workerPlus.resumeRun(currentOperatorNote))}><RotateCcw size={17}/> ادامه اجرا</button><button className="danger" disabled={operationBusy || !state?.running} onClick={() => action(() => window.workerPlus.stopRun(), false)}><Square size={16}/> توقف</button></div>
        <div className="cleanup-controls"><button className="ghost cleanup-button" dir="ltr" disabled={operationBusy || Boolean(state?.running) || !matchingOrder} onClick={resetLocalFiles}>{state?.cleaning ? <LoaderCircle className="spin" size={17}/> : <Trash2 size={17}/>} reset and cleanup</button><small>فایل‌ها و تاریخچهٔ اجرای فعلی روی همین دستگاه حذف می‌شوند. آرشیوها و سفارش سرور حفظ می‌شوند.</small>{notice && <p className="cleanup-notice" role="status">{notice}</p>}</div>
        <div className="output-actions"><button className="ghost workspace-button" disabled={operationBusy || !matchingOrder} onClick={() => window.workerPlus.openWorkspace()}><ExternalLink size={17}/> باز کردن workspace</button><div className="output-grid">{(["sample.pdf", "sample.docx", "final.pdf", "final.docx"] as const).map(name => { const artifact = currentArtifacts.find(record => record.kind === (name.startsWith("sample") ? "sample_package" : "rendered_pdf")); const available = matchingOrder && !operationBusy && Boolean(state?.outputs?.[name]) && (!workflow || artifact?.status === "VALIDATED"); return <button key={name} disabled={!available} className={available ? "" : "missing"} title={available ? `باز کردن ${name}` : "این خروجی هنوز معتبر و جاری نیست؛ نسخه‌های قبلی در تاریخچه قابل بررسی‌اند."} onClick={() => openOutput(name)}><FileText size={15}/><span>{name}</span></button>; })}</div></div>
      </section>
      </aside></div>
      {workflow && <section className="panel artifacts-panel"><div className="artifact-header"><div><h3>خروجی‌ها و شواهد اجرا</h3><p>{currentArtifacts.filter(record => record.status === "VALIDATED").length.toLocaleString("fa-IR")} خروجی تأییدشده · {currentArtifacts.filter(record => record.status === "STALE").length.toLocaleString("fa-IR")} وابستگی منقضی</p></div><div className="artifact-filters">{([ ["current", "نسخه‌های جاری"], ["all", "تاریخچه نسخه‌ها"], ["issues", "نیازمند رسیدگی"] ] as const).map(([key, title]) => <button key={key} aria-pressed={artifactFilter === key} className={artifactFilter === key ? "active" : ""} onClick={() => setArtifactFilter(key)}>{title}</button>)}</div></div>
        <div className="artifact-table-wrap"><table className="artifact-table"><thead><tr><th>خروجی مرحله</th><th>نسخه</th><th>اعتبارسنجی</th><th>وابستگی‌ها</th><th>فایل و گزارش</th></tr></thead><tbody>{visibleArtifacts.map(record => <tr key={record.id} className={record.current ? "" : "historical"}><td><b>{artifactLabels[record.kind] || labels[record.stage] || record.kind}</b><small>{record.current ? "نسخه جاری" : "نسخه تاریخی"} · {record.files.length.toLocaleString("fa-IR")} فایل</small>{record.validation?.issues.slice(0, 3).map((item, index) => <div className="artifact-issue" key={index}><code>{item.code}</code><span>{item.message}</span></div>)}</td><td className="version">v{record.version}</td><td><span className={`artifact-badge ${record.status.toLowerCase()}`}>{artifactStatuses[record.status] || record.status}</span></td><td><div className="dependency-list">{record.upstream.length ? record.upstream.map(parent => <span key={parent.id} title={parent.id}>{artifactLabels[parent.kind] || parent.kind} · v{parent.version}</span>) : <span>ورودی مستقل</span>}</div></td><td><div className="artifact-links"><button disabled={operationBusy} onClick={() => openArtifact(record)}><FileText size={14}/> فایل</button>{record.validation && <button disabled={operationBusy} onClick={() => openArtifact(record, true)}>گزارش</button>}</div></td></tr>)}</tbody></table>{!visibleArtifacts.length && <p className="artifact-empty">{artifactFilter === "issues" ? "خروجی نیازمند رسیدگی وجود ندارد." : "خروجی این اجرا هنوز ثبت نشده است."}</p>}</div>
        {matchingOrder && state?.context?.finalization_state && <div className={`finalization ${state.context.finalization_state === "FINALIZED" ? "passed" : ""}`}><CircleCheck size={17}/>{state.context.finalization_state === "FINALIZED" ? "کنترل نهایی انطباق پاس شده؛ بسته آمادهٔ تحویل و بررسی انسانی است." : "کنترل نهایی هنوز پاس نشده است."}</div>}
      </section>}
      <section className="panel console console-wide"><div className="console-title"><Terminal size={17}/><b>خروجی زنده</b><span>{matchingOrder && state?.running ? "در حال اجرا" : "متوقف"}</span></div><pre>{matchingOrder ? logs || (interruptedStep ? `پردازش فعالی پیدا نشد. آخرین اجرای ذخیره‌شده هنگام مرحله ${labels[interruptedStep] || interruptedStep} قطع شده است.` : "هنوز خروجی‌ای ثبت نشده است.") : "هنوز اجرایی برای این سفارش انتخاب نشده است."}</pre></section>
    </> : <section className="empty"><div><Search/><h2>یک سفارش را پیدا کنید</h2><p>لینک صفحه سفارش یا شناسه آن را در کادر بالا وارد کنید.</p></div></section>}
  </main>;
}
