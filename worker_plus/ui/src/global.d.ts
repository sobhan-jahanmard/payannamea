import type { WorkerEvent } from "../electron/preload";

type RunOptions = { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string };
declare global {
  interface Window { workerPlus: {
    lookupOrder(value: string): Promise<{ id: string; order: Record<string, unknown> }>;
    readState(): Promise<WorkerState>; startRun(options: RunOptions): Promise<unknown>; resumeRun(note?: string): Promise<unknown>;
    stopRun(): Promise<boolean>; openWorkspace(): Promise<void>;
    openOutput(name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx"): Promise<void>;
    onEvent(listener: (event: WorkerEvent) => void): () => void;
  }; }
}
export type WorkerState = { running: boolean; workspace: string; outputs: Record<string, boolean>; context: null | { order_id?: string; status?: string; mode?: string; current_step?: string | null; completed_steps?: string[]; errors?: string[]; operator_note?: string; recovery_history?: Array<{ failed_step?: string; restart_step?: string; error?: string; cycle?: number; same_error_count?: number }> } };
export {};
