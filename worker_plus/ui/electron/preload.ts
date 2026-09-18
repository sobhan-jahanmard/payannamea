import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("workerPlus", {
  lookupOrder: (value: string) => ipcRenderer.invoke("order:lookup", value),
  readState: () => ipcRenderer.invoke("worker:state"),
  startRun: (options: { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string }) => ipcRenderer.invoke("worker:start", options),
  resumeRun: (note?: string) => ipcRenderer.invoke("worker:resume", note),
  stopRun: () => ipcRenderer.invoke("worker:stop"),
  openWorkspace: () => ipcRenderer.invoke("worker:open-workspace"),
  openOutput: (name: "sample.pdf" | "sample.docx" | "final.pdf" | "final.docx") => ipcRenderer.invoke("worker:open-output", name),
  onEvent: (listener: (event: WorkerEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: WorkerEvent) => listener(value);
    ipcRenderer.on("worker:event", handler);
    return () => ipcRenderer.removeListener("worker:event", handler);
  }
});

export type WorkerEvent = { type: "log" | "exit" | "state"; value: unknown };
