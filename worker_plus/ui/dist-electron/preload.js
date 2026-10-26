"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("workerPlus", {
    lookupOrder: (value) => electron_1.ipcRenderer.invoke("order:lookup", value),
    downloadOrderFile: (orderId, collection, fileId) => electron_1.ipcRenderer.invoke("order:download-file", orderId, collection, fileId),
    listAiReviews: (orderId) => electron_1.ipcRenderer.invoke("ai-review:list", orderId),
    requestAiReview: (orderId) => electron_1.ipcRenderer.invoke("ai-review:start", orderId),
    requestAiFix: (orderId, reviewId, prompt) => electron_1.ipcRenderer.invoke("ai-review:fix", orderId, reviewId, prompt),
    readState: () => electron_1.ipcRenderer.invoke("worker:state"),
    presentationPreview: (orderId, number) => electron_1.ipcRenderer.invoke("presentation:preview", orderId, number),
    resizeDesktopWidget: (size) => electron_1.ipcRenderer.invoke("widget:resize", size),
    toggleDesktopWidget: () => electron_1.ipcRenderer.invoke("widget:toggle"),
    showMainWindow: () => electron_1.ipcRenderer.invoke("widget:show-main"),
    startRun: (options) => electron_1.ipcRenderer.invoke("worker:start", options),
    publishLocal: (orderId) => electron_1.ipcRenderer.invoke("worker:publish-local", orderId),
    resumeRun: (note) => electron_1.ipcRenderer.invoke("worker:resume", note),
    stopRun: () => electron_1.ipcRenderer.invoke("worker:stop"),
    resetRun: (options) => electron_1.ipcRenderer.invoke("worker:reset", options),
    openWorkspace: () => electron_1.ipcRenderer.invoke("worker:open-workspace"),
    openFinalFolder: () => electron_1.ipcRenderer.invoke("worker:open-final-folder"),
    openReport: (relativePath) => electron_1.ipcRenderer.invoke("worker:open-report", relativePath),
    openArtifact: (relativePath) => electron_1.ipcRenderer.invoke("worker:open-artifact", relativePath),
    openOutput: (name) => electron_1.ipcRenderer.invoke("worker:open-output", name),
    onEvent: (listener) => {
        const handler = (_event, value) => listener(value);
        electron_1.ipcRenderer.on("worker:event", handler);
        return () => electron_1.ipcRenderer.removeListener("worker:event", handler);
    }
});
