"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("workerPlus", {
    lookupOrder: (value) => electron_1.ipcRenderer.invoke("order:lookup", value),
    readState: () => electron_1.ipcRenderer.invoke("worker:state"),
    startRun: (options) => electron_1.ipcRenderer.invoke("worker:start", options),
    resumeRun: (note) => electron_1.ipcRenderer.invoke("worker:resume", note),
    stopRun: () => electron_1.ipcRenderer.invoke("worker:stop"),
    openWorkspace: () => electron_1.ipcRenderer.invoke("worker:open-workspace"),
    openOutput: (name) => electron_1.ipcRenderer.invoke("worker:open-output", name),
    onEvent: (listener) => {
        const handler = (_event, value) => listener(value);
        electron_1.ipcRenderer.on("worker:event", handler);
        return () => electron_1.ipcRenderer.removeListener("worker:event", handler);
    }
});
