"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const workerRoot = electron_1.app.isPackaged ? node_path_1.default.join(process.resourcesPath, "worker_plus") : node_path_1.default.resolve(__dirname, "../..");
const workspace = node_path_1.default.join(workerRoot, "workspace", "in_progress");
const contextFile = node_path_1.default.join(workspace, "order_context.json");
let window = null;
let child = null;
let stateTimer = null;
function envFile() {
    const file = node_path_1.default.join(workerRoot, ".env");
    if (!(0, node_fs_1.existsSync)(file))
        return {};
    return Object.fromEntries((0, node_fs_1.readFileSync)(file, "utf8").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['\"]|['\"]$/g, "")];
    }));
}
function settings() {
    const values = envFile();
    return { backend: (values.BACKEND_URL || "https://daneshyar.vercel.app").replace(/\/$/, ""), apiKey: values.WORKER_API_KEY || "local-worker-dev-key" };
}
function orderId(value) {
    const clean = value.trim();
    if (!clean)
        throw new Error("لینک یا شناسه سفارش را وارد کنید.");
    try {
        const url = new URL(clean);
        const segments = url.pathname.split("/").filter(Boolean);
        const marker = segments.findIndex(segment => segment === "orders" || segment === "order");
        return decodeURIComponent(marker >= 0 && segments[marker + 1] ? segments[marker + 1] : segments.at(-1) || "");
    }
    catch {
        return clean;
    }
}
function state() {
    const outputNames = ["sample.pdf", "sample.docx", "final.pdf", "final.docx"];
    const outputs = Object.fromEntries(outputNames.map(name => [name, (0, node_fs_1.existsSync)(node_path_1.default.join(workspace, "final", name))]));
    if (!(0, node_fs_1.existsSync)(contextFile))
        return { running: Boolean(child), context: null, workspace, outputs };
    try {
        return { running: Boolean(child), context: JSON.parse((0, node_fs_1.readFileSync)(contextFile, "utf8")), workspace, outputs };
    }
    catch {
        return { running: Boolean(child), context: null, workspace, outputs };
    }
}
function broadcast(type, value) { window?.webContents.send("worker:event", { type, value }); }
function run(args) {
    if (child)
        throw new Error("یک اجرا در حال انجام است.");
    const python = process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
    child = (0, node_child_process_1.spawn)(python, [node_path_1.default.join(workerRoot, "run.py"), ...args], { cwd: workerRoot, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    child.stdout.on("data", data => broadcast("log", data.toString()));
    child.stderr.on("data", data => broadcast("log", data.toString()));
    stateTimer = setInterval(() => broadcast("state", state()), 750);
    child.on("exit", (code, signal) => {
        child = null;
        if (stateTimer)
            clearInterval(stateTimer);
        stateTimer = null;
        broadcast("exit", { code, signal });
        broadcast("state", state());
    });
    broadcast("state", state());
    return { started: true };
}
function createWindow() {
    window = new electron_1.BrowserWindow({ width: 1280, height: 840, minWidth: 980, minHeight: 680, backgroundColor: "#f3f4f6", webPreferences: { preload: node_path_1.default.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
    if (process.env.VITE_DEV_SERVER_URL)
        window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else
        window.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"));
}
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.handle("order:lookup", async (_event, value) => {
        const id = orderId(value);
        const config = settings();
        const response = await fetch(`${config.backend}/api/worker/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(String(payload.detail || `خطای backend (${response.status})`));
        return { id, order: payload };
    });
    electron_1.ipcMain.handle("worker:state", () => state());
    electron_1.ipcMain.handle("worker:start", (_event, options) => {
        if (options.step) {
            const savedOrderId = state().context?.order_id;
            if (savedOrderId !== options.orderId)
                throw new Error("اجرای مرحله‌ای فقط برای سفارش موجود در workspace فعلی مجاز است. ابتدا اجرای کامل این سفارش را شروع کنید.");
        }
        const args = options.step ? ["--step", String(options.step)] : ["--order-id", options.orderId];
        if (options.offline)
            args.push("--offline");
        if (options.sample)
            args.push("--sample");
        if (options.note?.trim())
            args.push("--operator-note", options.note.trim());
        return run(args);
    });
    electron_1.ipcMain.handle("worker:resume", (_event, note) => run(note?.trim() ? ["--resume", "--operator-note", note.trim()] : ["--resume"]));
    electron_1.ipcMain.handle("worker:stop", () => {
        if (!child)
            return false;
        if (process.platform === "win32") {
            (0, node_child_process_1.spawn)("taskkill", ["/pid", String(child.pid), "/t"], { windowsHide: true });
            return true;
        }
        return child.kill("SIGTERM");
    });
    electron_1.ipcMain.handle("worker:open-workspace", async () => { await electron_1.shell.openPath(workspace); });
    electron_1.ipcMain.handle("worker:open-output", async (_event, name) => {
        const allowed = new Set(["sample.pdf", "sample.docx", "final.pdf", "final.docx"]);
        if (!allowed.has(name))
            throw new Error("نام فایل خروجی معتبر نیست.");
        const target = node_path_1.default.join(workspace, "final", name);
        if (!(0, node_fs_1.existsSync)(target))
            throw new Error(`فایل ${name} هنوز ساخته نشده است.`);
        const result = await electron_1.shell.openPath(target);
        if (!result)
            return { path: target };
        // Some Linux desktop environments do not report a registered application
        // through openPath even though xdg-open can resolve one. Try the native
        // desktop opener before surfacing the original error.
        const opener = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
        const opened = (0, node_child_process_1.spawn)(opener, [target], { detached: true, windowsHide: true, stdio: "ignore" });
        opened.unref();
        return { path: target, fallback: true };
    });
    createWindow();
    electron_1.app.on("activate", () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow(); });
});
electron_1.app.on("window-all-closed", () => { if (process.platform !== "darwin")
    electron_1.app.quit(); });
