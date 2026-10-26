import hints from "../../common/recovery_hints.json";
import presentationHints from "../../presentation/recovery_hints.json";
import stages from "../../common/stages.json";
import type { FailureRecord, WorkerState } from "./global";

export function failureForContext(context?: WorkerState["context"]): FailureRecord | undefined {
  if (!context) return undefined;
  if (context.active_failure?.error) return context.active_failure;
  if (!["failed", "paused"].includes(context.status || "")) return undefined;
  const previous = context.recovery_history?.at(-1);
  const error = context.errors?.at(-1) || context.pause_reason;
  if (previous?.error && (!error || previous.error === error)) return previous;
  if (!error) return undefined;
  const attempt = context.execution_trace?.nodes.at(-1);
  const step = context.current_step || attempt?.step || previous?.failed_step ||
    stages.find(stage => !context.completed_steps?.includes(stage.id))?.id;
  if (!step) return undefined;
  const normalized = step === "05c_research" ? "05c_research_evidence" : step;
  return { failed_step: normalized, restart_step: normalized, error,
    ...(/access is denied|permission denied|winerror 5|sharing violation|file is locked/i.test(error) ? { kind: "file_access" } : {}) };
}

export function recoveryNote(failure?: FailureRecord, presentation = false): string {
  if (!failure?.error) return "";
  if (failure.kind === "file_access") return `خطای دسترسی به فایل را بررسی کن و همان مرحله را ادامه بده؛ خروجی‌های تأییدشده را دوباره تولید نکن.\n${failure.error}`;
  if (presentation) {
    const stage = failure.restart_step || failure.failed_step || "";
    return [presentationHints.title, presentationHints.source_policy,
      `${hints.stage_instruction}${stage}: ${(presentationHints.stages as Record<string, string>)[stage] || presentationHints.default}`,
      hints.error_label + failure.error, ...(failure.issues || []).map(item => `- ${item.message}`),
      ...(failure.report_path ? [hints.report_instruction + failure.report_path] : []), hints.verify].join("\n");
  }
  if (failure.repair_note && failure.repair_note_version === hints.version) return failure.repair_note;
  const stage = failure.restart_step || failure.failed_step || "";
  const issues = failure.issues || [];
  const diagnostic = [failure.error, failure.kind || "", ...issues.map(item => item.code)].join(" ");
  const lines = [hints.title];
  hints.patterns.filter(item => new RegExp(item.match, "i").test(diagnostic)).forEach(item => lines.push(item.instruction));
  lines.push(`${hints.stage_instruction}${stage}: ${(hints.stages as Record<string, string>)[stage] || hints.default}`);
  lines.push(hints.error_label + failure.error);
  if (issues.length) {
    lines.push(hints.issues_label);
    issues.forEach(item => lines.push(`- ${item.message} [${item.code}]${item.location ? ` @ ${item.location}` : ""}`));
  }
  if (failure.report_path) lines.push(hints.report_instruction + failure.report_path);
  lines.push(hints.preserve, hints.verify);
  return lines.join("\n");
}

export function mergeRecoveryNote(note: string, automatic: string, previousAutomatic = ""): string {
  const manual = previousAutomatic ? note.replace(previousAutomatic, "").trim() : note.trim();
  return automatic && !manual.includes(automatic) ? [manual, automatic].filter(Boolean).join("\n\n") : manual;
}

export function removeLegacyPresentationPlan(note: string, failure?: FailureRecord): string {
  if (!failure?.error) return note;
  let result = note;
  for (const stage of new Set([failure.restart_step, failure.failed_step].filter(Boolean))) {
    result = result.replace(recoveryNote({ ...failure, restart_step: stage }), "").trim();
  }
  return result;
}
