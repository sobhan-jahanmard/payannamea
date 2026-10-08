import hints from "../../common/recovery_hints.json";
import type { FailureRecord } from "./global";

export function recoveryNote(failure?: FailureRecord): string {
  if (!failure?.error) return "";
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
