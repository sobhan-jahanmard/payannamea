import type { WorkerEvent } from "../electron/preload";

type RunOptions = { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string; autoRepair?: boolean };
declare global {
  interface Window { workerPlus: {
    lookupOrder(value: string): Promise<{ id: string; order: Record<string, unknown> }>;
    downloadOrderFile(orderId: string, collection: "files" | "final_outputs" | "payment_notes", fileId: string): Promise<{ saved: boolean; path?: string }>;
    listAiReviews(orderId: string): Promise<AiReview[]>;
    requestAiReview(orderId: string): Promise<AiReview>;
    requestAiFix(orderId: string, reviewId: string, prompt: string): Promise<AiReview>;
    presentationPreview(orderId: string): Promise<{ style: string; font: string; ready: boolean; slides: { number: number; title: string; notes: string }[] }>;
    presentationPreview(orderId: string, number: number): Promise<{ number: number; title: string; notes: string; image: string | null }>;
    resizeDesktopWidget(size: { width: number; height: number }): Promise<void>;
    toggleDesktopWidget(): Promise<boolean>; showMainWindow(): Promise<void>;
    readState(): Promise<WorkerState>; startRun(options: RunOptions): Promise<unknown>; publishLocal(orderId: string): Promise<unknown>; resumeRun(note?: string): Promise<unknown>;
    stopRun(): Promise<boolean>; openWorkspace(): Promise<void>; openFinalFolder(): Promise<void>; openReport(relativePath: string): Promise<void>;
    resetRun(options: { orderId: string; workspace: string }): Promise<{ reset: true; files_removed: number; workspace: string }>;
    openArtifact(relativePath: string): Promise<void>;
    openOutput(name: "sample.pdf" | "sample.pptx" | "sample.docx" | "final.pdf" | "final.pptx" | "final.docx" | "report_1.pdf" | "report_1.docx" | "report_2.pdf" | "report_2.docx" | "report_3.pdf" | "report_3.docx"): Promise<void>;
    onEvent(listener: (event: WorkerEvent) => void): () => void;
  }; }
}
export type ValidationIssue = { code: string; message: string; location?: string; responsible_stage?: string };
export type AiReview = {
  id: string; order_id: string; action: "review" | "fix"; status: "queued" | "running" | "completed" | "failed";
  parent_review_id: string | null; score: number | null; report: string | null; fix_prompt: string | null;
  requested_prompt: string | null; applied_files: string[]; restart_step: number | null; error: string | null;
  created_at: string; started_at: string | null; finished_at: string | null;
  restart_stage_id?: string | null; restart_reason?: string | null; suggested_restart_stage?: string | null;
  snapshot_path?: string | null;
};
export type AiReviewEvent = { id: string; review_id: string; after_attempt_id?: string | null;
  status: "queued" | "running" | "completed" | "failed"; score: number | null;
  created_at: string; started_at: string | null; finished_at: string | null; error?: string | null };
export type ArtifactRecord = { id: string; kind: string; stage: string; version: number; status: string; current: boolean; created_at: string; files: { path: string; snapshot: string; sha256: string; mime_type: string }[]; upstream: { id: string; kind: string; version: number }[]; validation?: { passed: boolean; report_path: string; issues: ValidationIssue[] } };
export type FailureRecord = { failed_step: string; restart_step: string; error: string; report_path?: string | null; kind?: string; retryable?: boolean; action?: string; repair_note?: string; repair_note_version?: number; cycle?: number; same_error_count?: number; issues?: ValidationIssue[] };
export type CodexCall = { id: string; step: string; scope: string; attempt_id: string; thread_id?: string | null; resumed_from?: string; continued: boolean; target: string; prompt_path: string; events_path: string; started_at: string; finished_at?: string | null; status: "running" | "succeeded" | "failed" | "interrupted"; response: string; error: string };
export type CodeRepairEvent = { id: string; step: string; after_attempt_id?: string | null; status: "running" | "applied" | "no_code_change" | "rejected" | "skipped" | "interrupted"; thread_id?: string | null; note: string; started_at: string; finished_at?: string | null; files: string[]; reason: string; turns?: { prompt_path: string; events_path: string; exit_code: number }[] };
export type ExecutionAttempt = { id: string; step: string; lane: number; status: "running" | "succeeded" | "failed" | "paused" | "interrupted"; started_at: string | null; finished_at: string | null; error: string; inferred: boolean; session_id?: string | null; codex_calls?: CodexCall[] };
export type ExecutionTrace = { version: number; trace_id: string; order_id: string | null; legacy_inferred: boolean; nodes: ExecutionAttempt[]; edges: { id: string; source: string; target: string; kind: string; inferred: boolean }[]; sessions: { id: string; started_at: string; mode: string }[]; repair_events?: CodeRepairEvent[]; review_events?: AiReviewEvent[] };
export type WorkerState = { running: boolean; desktopWidgetVisible?: boolean; cleaning?: boolean; workspace: string; outputs: Record<string, boolean>; logs?: string; autoRepair?: { status: "applied" | "no_code_change" | "rejected" | "skipped"; order_id?: string; stage?: string; files?: string[]; reason?: string }; workflow?: { run_id: string; order_id: string; artifacts: ArtifactRecord[] }; context: null | { execution_trace?: ExecutionTrace; order_id?: string; order?: Record<string, unknown>; status?: string; mode?: string; offline?: boolean; finalization_state?: string; current_step?: string | null; completed_steps?: string[]; errors?: string[]; operator_note?: string; pause_reason?: string; active_failure?: FailureRecord; usage?: { calls: number; totalTokens: number; cachedInputTokens: number; unknown_usage_calls: number }; research?: { total: number; direct: number; proxy: number; assumption: number; sourceCount: number }; recovery_history?: FailureRecord[] } };
export {};
