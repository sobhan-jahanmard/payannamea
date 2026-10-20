"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const cleanup_1 = require("./cleanup");
const workerRoot = electron_1.app.isPackaged ? node_path_1.default.join(process.resourcesPath, "worker_plus") : node_path_1.default.resolve(__dirname, "../..");
const appIcon = electron_1.app.isPackaged
    ? node_path_1.default.join(process.resourcesPath, "daneshyar-logo.png")
    : node_path_1.default.resolve(__dirname, "../../../frontend/public/images/daneshyar-logo.png");
function workspace() {
    const root = node_path_1.default.join(workerRoot, "workspace");
    try {
        const pointer = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(root, "active.json"), "utf8"));
        const resolved = node_path_1.default.resolve(root, String(pointer.path));
        const relative = node_path_1.default.relative(root, resolved);
        if (!relative.startsWith("..") && !node_path_1.default.isAbsolute(relative))
            return resolved;
    }
    catch { /* Legacy workspace remains available for resume. */ }
    return node_path_1.default.join(root, "in_progress");
}
function contextFile() { return node_path_1.default.join(workspace(), "order_context.json"); }
let window = null;
let child = null;
let stateTimer = null;
let logBuffer = "";
let cleaning = false;
function envFile() {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const candidates = electron_1.app.isPackaged
        ? [
            portableDir && node_path_1.default.resolve(portableDir, "..", "..", ".env"),
            portableDir && node_path_1.default.join(portableDir, ".env"),
            node_path_1.default.join(node_path_1.default.dirname(process.execPath), ".env"),
            node_path_1.default.join(workerRoot, ".env"),
        ]
        : [node_path_1.default.join(workerRoot, ".env")];
    const file = candidates.find((candidate) => Boolean(candidate && (0, node_fs_1.existsSync)(candidate)));
    if (!file)
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
function readUsage() {
    const file = node_path_1.default.join(workspace(), "telemetry", "summary.json");
    try {
        return (0, node_fs_1.existsSync)(file) ? { usage: JSON.parse((0, node_fs_1.readFileSync)(file, "utf8")) } : {};
    }
    catch {
        return {};
    }
}
function readResearch() {
    const file = node_path_1.default.join(workspace(), "research", "evidence.json");
    try {
        if (!(0, node_fs_1.existsSync)(file))
            return {};
        const validation = node_path_1.default.join(workspace(), "reports", "stage_checks", "research_evidence.json");
        if (!(0, node_fs_1.existsSync)(validation) || JSON.parse((0, node_fs_1.readFileSync)(validation, "utf8")).passed !== true)
            return {};
        const data = JSON.parse((0, node_fs_1.readFileSync)(file, "utf8"));
        if (!Array.isArray(data.deliverables))
            return {};
        const items = data.deliverables;
        return { research: {
                total: items.length,
                direct: items.filter((item) => item?.status === "direct").length,
                proxy: items.filter((item) => item?.status === "proxy").length,
                assumption: items.filter((item) => item?.status === "assumption").length,
                sourceCount: new Set(items.flatMap((item) => Array.isArray(item?.sources) ? item.sources.map((source) => String(source?.url || "")).filter(Boolean) : [])).size,
            } };
    }
    catch {
        return {};
    }
}
function state() {
    const catalog = node_path_1.default.join(workspace(), "reports", "workflow_artifacts.json");
    let workflow;
    try {
        if ((0, node_fs_1.existsSync)(catalog))
            workflow = JSON.parse((0, node_fs_1.readFileSync)(catalog, "utf8"));
    }
    catch { /* Atomic writer may be replacing the projection. */ }
    const outputNames = ["sample.pdf", "sample.docx", "final.pdf", "final.docx", "report_1.pdf", "report_1.docx", "report_2.pdf", "report_2.docx", "report_3.pdf", "report_3.docx"];
    const outputs = Object.fromEntries(outputNames.map(name => [name, (0, node_fs_1.existsSync)(node_path_1.default.join(workspace(), "final", name))]));
    if (!(0, node_fs_1.existsSync)(contextFile()))
        return { running: Boolean(child), cleaning, context: null, workspace: workspace(), outputs, logs: logBuffer };
    try {
        return { running: Boolean(child), cleaning, context: { ...JSON.parse((0, node_fs_1.readFileSync)(contextFile(), "utf8")), ...readUsage(), ...readResearch() }, workflow, workspace: workspace(), outputs, logs: logBuffer };
    }
    catch {
        return { running: Boolean(child), cleaning, context: null, workspace: workspace(), outputs, logs: logBuffer };
    }
}
function broadcast(type, value) {
    if (type === "log")
        logBuffer = (logBuffer + String(value)).slice(-100_000);
    window?.webContents.send("worker:event", { type, value });
}
function waitForExit(target, timeoutMs = 5000) {
    if (target.exitCode !== null || target.signalCode !== null)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Worker PID ${target.pid ?? "unknown"} did not exit within ${timeoutMs}ms.`));
        }, timeoutMs);
        const onExit = () => { cleanup(); resolve(); };
        const onError = (error) => { cleanup(); reject(error); };
        const cleanup = () => {
            clearTimeout(timer);
            target.off("exit", onExit);
            target.off("error", onError);
        };
        target.once("exit", onExit);
        target.once("error", onError);
    });
}
function run(args, note) {
    if (cleaning)
        throw new Error("پاک‌سازی محلی در حال انجام است.");
    if (child)
        throw new Error("یک اجرا در حال انجام است.");
    logBuffer = "";
    const configuredEnv = envFile();
    const python = configuredEnv.WORKER_PLUS_PYTHON || process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
    if (note?.trim())
        args.push("--operator-note-stdin");
    const spawnedChild = (0, node_child_process_1.spawn)(python, [node_path_1.default.join(workerRoot, "run.py"), ...args], { cwd: workerRoot, windowsHide: true, env: { ...process.env, ...configuredEnv, PYTHONUNBUFFERED: "1" } });
    child = spawnedChild;
    broadcast("log", `[worker] starting ${python} run.py ${args.join(" ")}\n`);
    spawnedChild.stdout.on("data", data => broadcast("log", data.toString()));
    spawnedChild.stderr.on("data", data => broadcast("log", data.toString()));
    stateTimer = setInterval(() => broadcast("state", state()), 750);
    let finished = false;
    const finish = (code, signal, error) => {
        if (finished)
            return;
        finished = true;
        if (error)
            broadcast("log", `[worker] failed to start: ${error.message}\n`);
        else
            broadcast("log", `[worker] exited (code=${code ?? "null"}, signal=${signal ?? "none"})\n`);
        if (child === spawnedChild)
            child = null;
        if (stateTimer)
            clearInterval(stateTimer);
        stateTimer = null;
        broadcast("exit", { code, signal, error: error?.message });
        broadcast("state", state());
    };
    spawnedChild.on("error", error => finish(null, null, error));
    spawnedChild.on("exit", (code, signal) => finish(code, signal));
    spawnedChild.stdin.on("error", error => broadcast("log", `[worker] guidance input failed: ${error.message}\n`));
    spawnedChild.stdin.end(note?.trim() || "", "utf8");
    broadcast("state", state());
    return { started: true };
}
function createWindow() {
    window = new electron_1.BrowserWindow({ width: 1280, height: 840, minWidth: 980, minHeight: 680, icon: appIcon, backgroundColor: "#f3f4f6", webPreferences: { preload: node_path_1.default.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
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
    electron_1.ipcMain.handle("worker:reset", async (_event, options) => {
        if (child || cleaning)
            throw new Error("ابتدا اجرای فعال را متوقف کنید و منتظر پایان آن بمانید.");
        const saved = state();
        if (!options?.orderId || saved.context?.order_id !== options.orderId || saved.workspace !== options.workspace)
            throw new Error("پاک‌سازی فقط برای اجرای محلی همین سفارش مجاز است؛ وضعیت برنامه را تازه‌سازی کنید.");
        cleaning = true;
        broadcast("state", state());
        try {
            const configuredEnv = envFile();
            const python = configuredEnv.WORKER_PLUS_PYTHON || process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
            const result = await (0, cleanup_1.cleanupWorkspace)(workerRoot, python, { ...process.env, ...configuredEnv }, options);
            logBuffer = "";
            return result;
        }
        finally {
            cleaning = false;
            broadcast("state", state());
        }
    });
    electron_1.ipcMain.handle("worker:start", (_event, options) => {
        if (options.step) {
            const savedOrderId = state().context?.order_id;
            if (savedOrderId !== options.orderId)
                throw new Error("اجرای مرحله‌ای فقط برای سفارش موجود در workspace فعلی مجاز است. ابتدا اجرای کامل این سفارش را شروع کنید.");
        }
        const args = options.step ? ["--step", String(options.step)] : ["--order-id", options.orderId];
        args.push(options.offline ? "--offline" : "--online");
        if (options.sample)
            args.push("--sample");
        return run(args, options.note);
    });
    electron_1.ipcMain.handle("worker:resume", (_event, note) => run(["--resume"], note));
    electron_1.ipcMain.handle("worker:stop", async () => {
        if (!child)
            return false;
        const target = child;
        const pid = target.pid;
        if (!pid)
            throw new Error("Worker process has no PID and cannot be stopped.");
        broadcast("log", `[worker] stop requested for PID ${pid}\n`);
        if (process.platform === "win32") {
            await new Promise((resolve, reject) => {
                const killer = (0, node_child_process_1.spawn)("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
                let output = "";
                killer.stdout.on("data", data => { output += data.toString(); });
                killer.stderr.on("data", data => { output += data.toString(); });
                killer.on("error", reject);
                killer.on("exit", code => {
                    if (output.trim())
                        broadcast("log", `[worker] taskkill: ${output.trim()}\n`);
                    if (code === 0)
                        resolve();
                    else
                        reject(new Error(`taskkill failed with exit code ${code}${output.trim() ? `: ${output.trim()}` : ""}`));
                });
            });
            await waitForExit(target);
            broadcast("log", `[worker] PID ${pid} stopped\n`);
            return true;
        }
        const stopped = target.kill("SIGTERM");
        if (!stopped)
            throw new Error("Worker process did not accept SIGTERM.");
        await waitForExit(target);
        broadcast("log", `[worker] PID ${pid} stopped\n`);
        return true;
    });
    electron_1.ipcMain.handle("worker:open-workspace", async () => { await electron_1.shell.openPath(workspace()); });
    electron_1.ipcMain.handle("worker:open-final-folder", async () => {
        const target = node_path_1.default.join(workspace(), "final");
        if (!(0, node_fs_1.existsSync)(target))
            throw new Error("پوشهٔ فایل‌های نهایی هنوز ساخته نشده است.");
        const result = await electron_1.shell.openPath(target);
        if (result)
            throw new Error(result);
    });
    electron_1.ipcMain.handle("worker:open-report", async (_event, relativePath) => {
        const root = node_path_1.default.resolve(workspace());
        const target = node_path_1.default.resolve(root, relativePath);
        const relative = node_path_1.default.relative(root, target).replace(/\\/g, "/");
        if (!["reports/", "research/", "analysis/", "datasets/"].some(prefix => relative.startsWith(prefix)) || relative.includes("../") || !(0, node_fs_1.existsSync)(target))
            throw new Error("گزارش خطا در workspace موجود نیست.");
        const result = await electron_1.shell.openPath(target);
        if (result)
            throw new Error(result);
    });
    electron_1.ipcMain.handle("worker:open-artifact", async (_event, relativePath) => {
        const root = node_path_1.default.resolve(workspace());
        const target = node_path_1.default.resolve(root, relativePath);
        const relative = node_path_1.default.relative(root, target).replace(/\\/g, "/");
        if (!["artifacts/", "reports/"].some(prefix => relative.startsWith(prefix)) || relative.includes("../") || !(0, node_fs_1.existsSync)(target) || ![".json", ".md", ".txt", ".csv", ".png", ".docx", ".pdf", ".xlsx"].includes(node_path_1.default.extname(target).toLowerCase()))
            throw new Error("فایل ثبت‌شده در workspace موجود نیست.");
        const result = await electron_1.shell.openPath(target);
        if (result)
            throw new Error(result);
    });
    electron_1.ipcMain.handle("worker:open-output", async (_event, name) => {
        const allowed = new Set(["sample.pdf", "sample.docx", "final.pdf", "final.docx", "report_1.pdf", "report_1.docx", "report_2.pdf", "report_2.docx", "report_3.pdf", "report_3.docx"]);
        if (!allowed.has(name))
            throw new Error("نام فایل خروجی معتبر نیست.");
        const context = JSON.parse((0, node_fs_1.readFileSync)(contextFile(), "utf8"));
        const completed = new Set(context.completed_steps || []);
        if (name.startsWith("report_") && !completed.has("09c_package_interim_reports"))
            throw new Error("گزارش میانی این اجرا هنوز تأیید نشده است.");
        const finished = ["dry_run_complete", "worker_done_pending_approval", "sample_pending_customer_approval", "completed"].includes(context.status);
        if (!name.startsWith("report_") && (!completed.has("10_validate_and_publish") || (context.finalization_state !== "FINALIZED" && !finished)))
            throw new Error("بستهٔ نهایی این اجرا هنوز تأیید نشده است.");
        const target = node_path_1.default.join(workspace(), "final", name);
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
