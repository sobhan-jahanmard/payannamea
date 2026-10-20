import type { WorkerEvent } from "../electron/preload";

type RunOptions = { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string };
declare global {
  interface Window { workerPlus: {
    lookupOrder(value: string): Promise<{ id: string; order: Record<string, unknown> }>;
    readState(): Promise<WorkerState>; startRun(options: RunOptions): Promise<unknown>; resumeRun(note?: string): Promise<unknown>;
    stopRun(): Promise<boolean>; openWorkspace(): Promise<void>; openFinalFolder(): Promise<void>; openReport(relativePath: string): Promise<void>;
    resetRun(options: { orderId: string; workspace: string }): Promise<{ reset: true; files_removed: number; workspace: string }>;
    openArtifact(relativePath: string): Promise<void>;
    openOutput(name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx" | "report_1.pdf" | "report_1.docx" | "report_2.pdf" | "report_2.docx" | "report_3.pdf" | "report_3.docx"): Promise<void>;
    onEvent(listener: (event: WorkerEvent) => void): () => void;
  }; }
}
export type ValidationIssue = { code: string; message: string; location?: string; responsible_stage?: string };
export type ArtifactRecord = { id: string; kind: string; stage: string; version: number; status: string; current: boolean; created_at: string; files: { path: string; snapshot: string; sha256: string; mime_type: string }[]; upstream: { id: string; kind: string; version: number }[]; validation?: { passed: boolean; report_path: string; issues: ValidationIssue[] } };
export type FailureRecord = { failed_step: string; restart_step: string; error: string; report_path?: string | null; kind?: string; retryable?: boolean; action?: string; repair_note?: string; repair_note_version?: number; cycle?: number; same_error_count?: number; issues?: ValidationIssue[] };
export type WorkerState = { running: boolean; cleaning?: boolean; workspace: string; outputs: Record<string, boolean>; logs?: string; workflow?: { run_id: string; order_id: string; artifacts: ArtifactRecord[] }; context: null | { order_id?: string; order?: Record<string, unknown>; status?: string; mode?: string; offline?: boolean; finalization_state?: string; current_step?: string | null; completed_steps?: string[]; errors?: string[]; operator_note?: string; pause_reason?: string; active_failure?: FailureRecord; usage?: { calls: number; totalTokens: number; cachedInputTokens: number; unknown_usage_calls: number }; research?: { total: number; direct: number; proxy: number; assumption: number; sourceCount: number }; recovery_history?: FailureRecord[] } };
export {};
