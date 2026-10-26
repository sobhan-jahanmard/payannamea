import { useEffect, useMemo, useState } from "react";
import { CircleAlert, ClipboardCheck, LoaderCircle, RotateCcw, Wrench } from "lucide-react";
import type { AiReview } from "./global";
import "./ai-review.css";

const statusLabel: Record<AiReview["status"], string> = {
  queued: "در صف", running: "در حال اجرا", completed: "کامل شد", failed: "ناموفق"
};
const dateLabel = (value: string) => new Date(value).toLocaleString("fa-IR");
const errorLabel = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
  .replace(/^Error invoking remote method '[^']+': Error: /, "");

export function AiReviewPanel({ orderId }: { orderId: string }) {
  const [jobs, setJobs] = useState<AiReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptFor, setPromptFor] = useState("");

  useEffect(() => {
    let alive = true;
    setJobs([]); setLoading(true); setError(""); setPrompt(""); setPromptFor("");
    const refresh = async () => {
      try {
        const next = await window.workerPlus.listAiReviews(orderId);
        if (alive) { setJobs(next); setError(""); }
      } catch (cause) {
        if (alive) setError(errorLabel(cause));
      } finally { if (alive) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [orderId]);

  const active = jobs.some(job => job.status === "queued" || job.status === "running");
  const latestReview = useMemo(() => jobs.find(job => job.action === "review" && job.status === "completed"), [jobs]);
  const latestFix = latestReview && jobs.find(job => job.action === "fix" && job.parent_review_id === latestReview.id);
  const fixAlreadyRequested = Boolean(latestFix && latestFix.status !== "failed");

  useEffect(() => {
    if (!latestReview || latestReview.id === promptFor) return;
    setPrompt(latestReview.fix_prompt || "");
    setPromptFor(latestReview.id);
  }, [latestReview, promptFor]);

  async function requestReview() {
    if (busy || active) return;
    setBusy(true); setError("");
    try {
      const queued = await window.workerPlus.requestAiReview(orderId);
      setJobs(previous => [queued, ...previous]);
    } catch (cause) { setError(errorLabel(cause)); }
    finally { setBusy(false); }
  }

  async function requestFix() {
    if (!latestReview || busy || active || fixAlreadyRequested) return;
    setBusy(true); setError("");
    try {
      const queued = await window.workerPlus.requestAiFix(orderId, latestReview.id, prompt);
      setJobs(previous => [queued, ...previous]);
    } catch (cause) { setError(errorLabel(cause)); }
    finally { setBusy(false); }
  }

  return <section className="panel ai-review-panel" aria-labelledby="ai-review-heading" dir="rtl">
    <div className="ai-review-heading">
      <div className="ai-review-heading-copy"><span className="ai-review-eyebrow">کنترل کیفیت خروجی</span><h3 id="ai-review-heading"><ClipboardCheck size={21}/> بازبینی توسط هوش مصنوعی</h3><p>خروجی اصلی و فایل‌های ورودی سفارش بررسی می‌شوند. گزارش، نمره و راهکار اصلاح اینجا ثبت می‌شوند.</p></div>
    </div>
    {error && <div className="ai-review-error" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
    {loading && <p className="ai-review-muted">در حال دریافت سابقهٔ بازبینی…</p>}
    {!loading && jobs.length === 0 && <p className="ai-review-empty">هنوز بازبینی‌ای برای این سفارش ثبت نشده است. پس از آماده‌شدن خروجی نهایی، بازبینی را شروع کنید.</p>}
    {active && <div className="ai-review-progress" role="status"><LoaderCircle className="spin" size={17}/> {jobs[0]?.action === "fix" ? "اعمال اصلاحات این سفارش و بازسازی خروجی" : "بررسی فایل‌ها و تولید گزارش"} {statusLabel[jobs[0]?.status] || "در جریان"} است.</div>}
    {latestReview && <div className="ai-review-result">
      <div className="ai-review-score"><span>{latestFix?.status === "completed" ? "نمرهٔ نسخهٔ پیش از اصلاح؛ نسخهٔ تازه را بازبینی کنید" : "آخرین نمرهٔ بازبینی"}</span><strong>{latestReview.score?.toLocaleString("fa-IR") ?? "—"}<small> از ۲۰</small></strong><time>{dateLabel(latestReview.finished_at || latestReview.created_at)}</time></div>
      <div className="ai-review-report"><h4>گزارش ارزیابی</h4><div className="ai-review-text" dir="auto">{latestReview.report}</div></div>
      <div className="ai-review-fix"><label htmlFor="ai-review-fix-prompt">پیشنهاد اصلاح همین سفارش</label><textarea id="ai-review-fix-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows={6} disabled={fixAlreadyRequested} placeholder="ضعف‌های خروجی و روش اصلاح آن‌ها…"/><div className="ai-review-fix-footer"><small>{fixAlreadyRequested ? "اصلاح این بازبینی ثبت شده است. بعد از پایان اجرا، نسخهٔ تازه را دوباره بازبینی کنید." : "متن را می‌توانید ویرایش کنید؛ اجرا از نخستین مرحلهٔ وابسته به اصلاحات ادامه می‌یابد."}</small></div></div>
    </div>}
    {jobs.length > 0 && <div className="ai-review-history"><h4><RotateCcw size={16}/> تاریخچهٔ بازبینی و اصلاح</h4><ol>{jobs.map(job => <li key={job.id} className={`ai-review-history-item ${job.status}`}><div className="ai-review-history-top"><b>{job.action === "review" ? "بازبینی" : "اصلاح همین سفارش"}</b><span>{statusLabel[job.status]}</span><time>{dateLabel(job.created_at)}</time>{job.action === "review" && job.score != null && <strong>نمره {job.score.toLocaleString("fa-IR")} از ۲۰</strong>}</div>{job.error && <p className="ai-review-history-error">{job.error}</p>}{job.action === "fix" && job.restart_step != null && <p>بازاجرای سفارش از مرحلهٔ {job.restart_step.toLocaleString("fa-IR")} ({job.restart_stage_id || "—"}) {job.status === "completed" ? "تا اعتبارسنجی نهایی انجام شد." : "آغاز شد."}</p>}{job.action === "fix" && job.requested_prompt && <details><summary>دستور اصلاح ارسالی</summary><p dir="auto">{job.requested_prompt}</p></details>}{job.action === "review" && job.status === "completed" && <details><summary>گزارش و پیشنهاد این نوبت</summary><p dir="auto">{job.report}</p><p dir="auto">{job.fix_prompt}</p></details>}</li>)}</ol></div>}
    <div className="ai-review-actions" aria-label="اقدام‌های بازبینی"><span>اقدام‌های بازبینی</span><button type="button" className="primary ai-review-start" disabled={busy || active || loading} onClick={requestReview}>{busy ? <LoaderCircle className="spin" size={17}/> : <ClipboardCheck size={17}/>} بازبینی توسط هوش مصنوعی</button><button type="button" className="ai-review-fix-button" disabled={!latestReview || busy || active || fixAlreadyRequested || prompt.trim().length < 20} onClick={requestFix}><Wrench size={17}/> اصلاح با موارد ذکرشده</button></div>
  </section>;
}
