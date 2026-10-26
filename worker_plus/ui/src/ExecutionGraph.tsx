import { useId, useState } from "react";
import { FileJson, Minus, Plus } from "lucide-react";
import stages from "../../common/stages.json";
import type { ExecutionAttempt, ExecutionTrace } from "./global";

const statusLabels: Record<string, string> = { pending: "هنوز اجرا نشده", running: "در حال اجرا", succeeded: "موفق", failed: "خطا", paused: "مکث", interrupted: "قطع‌شده" };
const stageId = (id: string) => id === "05c_research" ? "05c_research_evidence" : id;
const row = (step: string) => stages.findIndex(stage => stage.id === stageId(step));

export function ExecutionGraph({ trace, orderId, running, labelFor, onOpen, disabled }: {
  trace?: ExecutionTrace; orderId: string; running: boolean; labelFor: (id: string) => string; onOpen: (relativePath?: string) => void; disabled: boolean;
}) {
  const marker = useId().replace(/:/g, "");
  const [selectedId, setSelectedId] = useState("");
  const [zoom, setZoom] = useState(1);
  const validTrace = trace?.order_id === orderId ? trace : undefined;
  const nodes = validTrace?.nodes.filter(node => row(node.step) >= 0) || [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = validTrace?.edges.filter(edge => byId.has(edge.source) && byId.has(edge.target)) || [];
  const repairEvents = validTrace?.repair_events || [];
  const reviewEvents = [...(validTrace?.review_events || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let lastReviewLane = -1;
  const reviewPoints = reviewEvents.map(event => {
    const anchor = byId.get(event.after_attempt_id || "") || [...nodes].reverse().find(node =>
      node.started_at && node.started_at <= event.created_at) || nodes.at(-1);
    const lane = Math.max(lastReviewLane + 1, anchor?.lane || 0);
    lastReviewLane = lane;
    return { event, anchor, lane };
  });
  const lanes = Math.max(1, ...nodes.map(node => node.lane + 1), ...reviewPoints.map(point => point.lane + 1));
  const returns = edges.filter(edge => edge.kind !== "forward").length;
  const codexTurns = nodes.reduce((count, node) => count + (node.codex_calls?.length || 0), 0);
  const selectedReview = reviewPoints.find(point => point.event.id === selectedId) || (!selectedId ? reviewPoints.at(-1) : undefined);
  const selected = selectedReview ? undefined : byId.get(selectedId) || nodes.at(-1);
  const status = (node: ExecutionAttempt) => node.status === "running" && !running ? "interrupted" : node.status;
  const x = (lane: number) => 58 + lane * 108;
  const y = (step: string) => 68 + row(step) * 54;
  const reviewY = y(stages.at(-1)!.id) + 76;
  const width = Math.max(220, x(lanes - 1) + 58);
  const height = reviewPoints.length ? reviewY + 58 : y(stages.at(-1)!.id) + 42;
  const number = (step: string) => (row(step) + 1).toLocaleString("fa-IR");
  const formatTime = (value: string | null) => value ? new Date(value).toLocaleString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", month: "short", day: "numeric" }) : "زمان ثبت نشده";

  return <section className="panel execution-graph" aria-label="گراف مسیر اجرا">
    <div className="graph-header"><div><h3>مسیر واقعی اجرا</h3><p>{nodes.length.toLocaleString("fa-IR")} تلاش · {returns.toLocaleString("fa-IR")} برگشت / ادامهٔ مجدد{codexTurns ? ` · ${codexTurns.toLocaleString("fa-IR")} نوبت Codex` : ""}{repairEvents.length ? ` · ${repairEvents.length.toLocaleString("fa-IR")} بررسی کد` : ""}{reviewPoints.length ? ` · ${reviewPoints.length.toLocaleString("fa-IR")} بازبینی AI` : ""}</p></div><button className="graph-file" disabled={disabled || !validTrace} onClick={() => onOpen()} title="باز کردن فایل تاریخچهٔ گراف" aria-label="باز کردن فایل تاریخچهٔ گراف"><FileJson size={17}/></button></div>
    <div className="graph-legend"><span className="success">موفق</span><span className="running">در حال اجرا</span><span className="failed">خطا</span><span className="paused">مکث / قطع</span>{reviewPoints.length > 0 && <span className="review">بازبینی AI و نمره</span>}<span className="return">↗ مسیر بازگشت</span></div>
    {validTrace?.legacy_inferred && <p className="graph-legacy">بخش قدیمی مسیر از سوابق بازیابی بازسازی شده است؛ زمان و جزئیات ثبت‌نشده، تخمینی نمایش داده نمی‌شود.</p>}
    <div className="graph-selection" aria-live="polite">
      {selectedReview ? <><div><b>بازبینی توسط هوش مصنوعی{selectedReview.event.score != null ? ` · نمره ${selectedReview.event.score.toLocaleString("fa-IR")} از ۲۰` : ""}</b><span className={`graph-status ${selectedReview.event.status}`}>{selectedReview.event.status === "completed" ? "کامل شد" : selectedReview.event.status === "failed" ? "ناموفق" : "در جریان"}</span></div><small>{formatTime(selectedReview.event.finished_at || selectedReview.event.started_at || selectedReview.event.created_at)}</small>{selectedReview.event.error && <p dir="auto">{selectedReview.event.error}</p>}</> : selected ? <><div><b>مرحلهٔ {number(selected.step)} · {labelFor(stageId(selected.step))}</b><span className={`graph-status ${status(selected)}`}>{statusLabels[status(selected)]}</span></div><small>مسیر {(selected.lane + 1).toLocaleString("fa-IR")} · {selected.inferred ? "بازسازی از سوابق" : formatTime(selected.started_at)}</small>{selected.error && <p dir="auto">{selected.error}</p>}{Boolean(selected.codex_calls?.length) && <div className="graph-codex-history"><b>گفت‌وگوهای Codex در این تلاش</b>{selected.codex_calls!.map((call, index) => <div className="graph-codex-call" key={call.id}><div><strong>نوبت {(index + 1).toLocaleString("fa-IR")} · {call.continued ? "ادامهٔ گفتگو" : "گفتگوی تازه"}</strong><span className={`graph-status ${call.status}`}>{call.status === "succeeded" ? "موفق" : call.status === "failed" ? "خطا" : call.status === "interrupted" ? "قطع‌شده" : "در حال اجرا"}</span></div><small dir="ltr">{call.thread_id ? `Thread ${call.thread_id}` : "شناسهٔ گفتگو هنوز ثبت نشده"} · {call.target}</small>{call.error && <p dir="auto">{call.error}</p>}{call.response && <p dir="auto">{call.response}</p>}<div className="graph-codex-files"><button disabled={disabled} onClick={() => onOpen(call.prompt_path)}>دستور ارسال‌شده</button><button disabled={disabled || call.status === "running" || call.status === "interrupted"} onClick={() => onOpen(call.events_path)}>رویدادهای اجرا</button></div></div>)}</div>}</> : <p>با شروع اجرا، گره‌ها و فلش‌ها در فایل این سفارش ثبت می‌شوند.</p>}
      {selected && repairEvents.filter(event => event.after_attempt_id === selected.id).map(event => <div className="graph-codex-history" key={event.id}><b>بررسی و اصلاح کد پس از این خطا</b><small>{formatTime(event.finished_at || event.started_at)} · {event.status === "applied" ? "اصلاح آزموده اعمال شد" : event.status === "no_code_change" ? "نیازی به تغییر کد نبود" : event.status === "running" ? "در حال بررسی" : event.status === "interrupted" ? "قطع‌شده" : "اصلاح کد انجام نشد"}</small>{event.thread_id && <small dir="ltr">Thread {event.thread_id}</small>}{event.files.length > 0 && <small dir="ltr">{event.files.join("، ")}</small>}{event.reason && <p dir="auto">{event.reason}</p>}{event.turns?.map((turn, index) => <div className="graph-codex-files" key={turn.prompt_path}><span>نوبت {(index + 1).toLocaleString("fa-IR")}</span><button disabled={disabled} onClick={() => onOpen(turn.prompt_path)}>دستور</button><button disabled={disabled} onClick={() => onOpen(turn.events_path)}>رویدادها</button></div>)}</div>)}
    </div>
    <div className="graph-tools"><span>هر ستون یک مسیر؛ هر گره یک بار اجرای مرحله</span><div><button aria-label="کوچک کردن گراف" disabled={zoom <= .6} onClick={() => setZoom(value => Math.max(.6, value - .2))}><Minus size={15}/></button><button aria-label="بزرگ کردن گراف" disabled={zoom >= 1.4} onClick={() => setZoom(value => Math.min(1.4, value + .2))}><Plus size={15}/></button></div></div>
    <div className="graph-canvas" dir="ltr">
      <svg width={Math.max(220, width * zoom)} height={height * zoom} viewBox={`0 0 ${width} ${height}`} aria-label="گره‌ها و فلش‌های جهت‌دار مراحل" role="group">
        <defs><marker id={`${marker}-forward`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#78a590"/></marker><marker id={`${marker}-return`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#bf681c"/></marker></defs>
        {Array.from({ length: lanes }, (_, lane) => <g key={lane}><text className="graph-lane-label" x={x(lane)} y={24} textAnchor="middle">مسیر {(lane + 1).toLocaleString("fa-IR")}</text><line className="graph-guide" x1={x(lane)} x2={x(lane)} y1={44} y2={height - 20}/></g>)}
        {stages.filter(stage => !nodes.some(node => node.lane === 0 && stageId(node.step) === stage.id)).map(stage => <g className="graph-node pending" key={stage.id} transform={`translate(${x(0)},${y(stage.id)})`}><title>{labelFor(stage.id)} — هنوز اجرا نشده</title><circle r={17}/><text textAnchor="middle" dy=".35em">{number(stage.id)}</text></g>)}
        {edges.map(edge => {
          const source = byId.get(edge.source)!; const target = byId.get(edge.target)!;
          const parallel = source.lane !== target.lane;
          const startX = x(source.lane) + (parallel ? 19 : 0); const startY = y(source.step) + (parallel ? 0 : 19);
          const endX = x(target.lane) - (parallel ? 22 : 0); const endY = y(target.step) - (parallel ? 0 : 22);
          const mid = (startX + endX) / 2;
          return <path key={edge.id} className={`graph-edge ${parallel ? "return" : "forward"}`} data-kind={edge.kind} data-source-step={row(source.step) + 1} data-target-step={row(target.step) + 1} d={parallel ? `M ${startX} ${startY} C ${mid} ${startY}, ${mid} ${endY}, ${endX} ${endY}` : `M ${startX} ${startY} L ${endX} ${endY}`} markerEnd={`url(#${marker}-${parallel ? "return" : "forward"})`}><title>از مرحلهٔ {number(source.step)} به {number(target.step)}{parallel ? "؛ مسیر موازی جدید" : ""}</title></path>;
        })}
        {nodes.map(node => <g key={node.id} className={`graph-node ${status(node)} ${node.id === selected?.id ? "selected" : ""} ${node.inferred ? "inferred" : ""}`} transform={`translate(${x(node.lane)},${y(node.step)})`} role="button" tabIndex={0} aria-label={`مرحلهٔ ${number(node.step)}، مسیر ${(node.lane + 1).toLocaleString("fa-IR")}، ${statusLabels[status(node)]}`} onClick={() => setSelectedId(node.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(node.id); } }}><title>{labelFor(stageId(node.step))} — {statusLabels[status(node)]}{node.error ? `\n${node.error}` : ""}</title><circle r={18}/><text textAnchor="middle" dy=".35em">{number(node.step)}</text></g>)}
        {reviewPoints.length > 0 && <text className="graph-review-row-label" x={8} y={reviewY - 38}>بازبینی AI</text>}
        {reviewPoints.map(({ event, anchor, lane }) => <g key={event.id}>
          {anchor && <path className="graph-edge review" d={`M ${x(anchor.lane)} ${y(anchor.step) + 19} L ${x(lane)} ${reviewY - 27}`} markerEnd={`url(#${marker}-forward)`}><title>از خروجی اجرا به بازبینی هوش مصنوعی</title></path>}
          <g className={`graph-node review ${event.status} ${event.id === selectedReview?.event.id ? "selected" : ""}`} transform={`translate(${x(lane)},${reviewY})`} role="button" tabIndex={0} aria-label={`بازبینی هوش مصنوعی، ${event.score != null ? `نمره ${event.score.toLocaleString("fa-IR")} از ۲۰` : event.status === "failed" ? "ناموفق" : "در جریان"}`} onClick={() => setSelectedId(event.id)} onKeyDown={keyEvent => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); setSelectedId(event.id); } }}><title>{event.score != null ? `بازبینی AI: ${event.score.toLocaleString("fa-IR")} از ۲۰` : event.error || "بازبینی در جریان"}</title><circle r={25}/><text textAnchor="middle" dy=".35em">{event.score != null ? event.score.toLocaleString("fa-IR") : event.status === "failed" ? "!" : "…"}</text><text className="graph-review-denominator" textAnchor="middle" y={40}>{event.score != null ? "از ۲۰" : "بازبینی"}</text></g>
        </g>)}
      </svg>
    </div>
  </section>;
}
