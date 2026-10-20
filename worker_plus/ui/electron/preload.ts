import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("workerPlus", {
  lookupOrder: (value: string) => ipcRenderer.invoke("order:lookup", value),
  readState: () => ipcRenderer.invoke("worker:state"),
  startRun: (options: { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string }) => ipcRenderer.invoke("worker:start", options),
  resumeRun: (note?: string) => ipcRenderer.invoke("worker:resume", note),
  stopRun: () => ipcRenderer.invoke("worker:stop"),
  resetRun: (options: { orderId: string; workspace: string }) => ipcRenderer.invoke("worker:reset", options),
  openWorkspace: () => ipcRenderer.invoke("worker:open-workspace"),
  openFinalFolder: () => ipcRenderer.invoke("worker:open-final-folder"),
  openReport: (relativePath: string) => ipcRenderer.invoke("worker:open-report", relativePath),
  openArtifact: (relativePath: string) => ipcRenderer.invoke("worker:open-artifact", relativePath),
  openOutput: (name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx" | "report_1.pdf" | "report_1.docx" | "report_2.pdf" | "report_2.docx" | "report_3.pdf" | "report_3.docx") => ipcRenderer.invoke("worker:open-output", name),
  onEvent: (listener: (event: WorkerEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: WorkerEvent) => listener(value);
    ipcRenderer.on("worker:event", handler);
    return () => ipcRenderer.removeListener("worker:event", handler);
  }
});

export type WorkerEvent = { type: "log" | "exit" | "state"; value: unknown };
