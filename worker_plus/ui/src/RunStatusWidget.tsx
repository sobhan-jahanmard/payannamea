import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleDashed, ExternalLink, LoaderCircle, Pause } from "lucide-react";
import stageDefinitions from "../../common/stages.json";
import presentationLabels from "../../presentation/stages.json";
import type { WorkerState } from "./global";

const finished = new Set(["dry_run_complete", "worker_done_pending_approval", "sample_pending_customer_approval", "completed"]);
const stageId = (id?: string | null) => id === "05c_research" ? "05c_research_evidence" : id;

export function RunStatusWidget({ state, desktop = false }: { state: WorkerState | null; desktop?: boolean }) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!desktop || !element.current) return;
    const observer = new ResizeObserver(() => {
      const bounds = element.current?.getBoundingClientRect();
      if (bounds) void window.workerPlus.resizeDesktopWidget({ width: Math.ceil(bounds.width + 16), height: Math.ceil(bounds.height + 16) });
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [desktop]);
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("workerPlus.runWidget.expanded") !== "false"; } catch { return true; }
  });
  const context = state?.context;
  const completed = new Set(context?.completed_steps || []);
  const doneCount = stageDefinitions.filter(stage => completed.has(stage.id)).length;
  const done = !state?.running && finished.has(context?.status || "") && completed.has("10_validate_and_publish");
  const failure = !done ? context?.active_failure || (["paused", "failed"].includes(context?.status || "") ? context?.recovery_history?.at(-1) : undefined) : undefined;
  const hasError = !state?.running && !done && Boolean(failure || context?.status === "failed");
  const activeId = stageId(state?.running
    ? context?.current_step || stageDefinitions.find(stage => !completed.has(stage.id))?.id
    : hasError ? failure?.failed_step || context?.current_step : done ? "10_validate_and_publish" : context?.current_step);
  const index = stageDefinitions.findIndex(stage => stage.id === activeId);
  const stage = stageDefinitions[index];
  const research = context?.order?.order_type === "تحقیق دانشگاهی";
  const presentationTitle = context?.order?.order_type === "ارائه و پاورپوینت" && activeId && activeId in presentationLabels ? presentationLabels[activeId as keyof typeof presentationLabels] : undefined;
  const title = presentationTitle || (research && activeId === "06_build_thesis_plan" ? "طرح بخش‌های گزارش بر پایه شواهد"
    : research && activeId === "09c_package_interim_reports" ? "بررسی نیاز به گزارش میانی" : stage?.label);
  const tone = state?.cleaning ? "idle" : state?.running ? "running" : done ? "done" : hasError ? "failed" : context ? "paused" : "idle";
  const status = state?.cleaning ? "در حال پاک‌سازی" : state?.running ? failure ? "در حال اصلاح خطا" : stage ? "در حال اجرا" : "در حال شروع"
    : done ? "کامل شد" : hasError ? "خطا در اجرا" : context ? "متوقف" : state ? "آمادهٔ اجرا" : "دریافت وضعیت";
  const Icon = state?.running || !state || state?.cleaning ? LoaderCircle : done ? CircleCheck : hasError ? CircleAlert : context ? Pause : CircleDashed;
  const summary = `${index >= 0 ? `مرحلهٔ ${(index + 1).toLocaleString("fa-IR")} · ` : ""}${status}`;
  const percent = Math.round(doneCount / stageDefinitions.length * 100);
  const error = failure?.error || context?.pause_reason || context?.errors?.at(-1);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem("workerPlus.runWidget.expanded", String(next)); } catch { /* The toggle also works without persistent storage. */ }
  }

  return <aside ref={element} className={`run-widget ${tone} ${expanded ? "expanded" : "collapsed"}`} aria-label="وضعیت زندهٔ اجرا" dir="rtl">
    <button type="button" className="run-widget-toggle" onClick={toggle} aria-expanded={expanded} aria-controls="run-widget-details" aria-label={expanded ? "جمع کردن وضعیت اجرا" : "باز کردن وضعیت اجرا"}>
      <span className="run-widget-icon"><Icon size={20} className={Icon === LoaderCircle ? "spin" : undefined}/></span>
      <span className="run-widget-summary" role="status" aria-live="polite" aria-atomic="true">{summary}</span>
      {expanded ? <ChevronDown size={17}/> : <ChevronUp size={17}/>}
    </button>
    {expanded && <div id="run-widget-details" className="run-widget-details">
      <b className="run-widget-title">{title || (context ? "اجرای ذخیره‌شده" : "هنوز اجرایی شروع نشده است")}</b>
      {activeId && <code className="run-widget-stage">{activeId}</code>}
      {context?.order_id && <><p className="run-widget-order">{String(context.order?.title || context.order_id)}</p><div className="run-widget-progress-copy"><span>{doneCount.toLocaleString("fa-IR")} از {stageDefinitions.length.toLocaleString("fa-IR")} مرحله</span><b>{percent.toLocaleString("fa-IR")}٪</b></div><div className="run-widget-progress" role="progressbar" aria-label="مراحل انجام‌شده" aria-valuemin={0} aria-valuemax={stageDefinitions.length} aria-valuenow={doneCount}><i style={{ width: `${percent}%` }}/></div></>}
      {!state?.running && !done && error && <p className="run-widget-error" dir="auto">{error}</p>}
      {state?.running && failure && <p className="run-widget-hint">worker در حال تلاش دوباره برای اصلاح خطاست.</p>}
      {desktop && <button type="button" className="run-widget-open-app" onClick={() => void window.workerPlus.showMainWindow()}><ExternalLink size={14}/> باز کردن برنامه</button>}
    </div>}
  </aside>;
}
