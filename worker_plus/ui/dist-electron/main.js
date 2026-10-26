"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const cleanup_1 = require("./cleanup");
const presentation_preview_1 = require("./presentation-preview");
const bundledWorkerRoot = electron_1.app.isPackaged ? node_path_1.default.join(process.resourcesPath, "worker_plus") : null;
const nearbyWorkerRoot = process.env.PORTABLE_EXECUTABLE_DIR
    ? node_path_1.default.resolve(process.env.PORTABLE_EXECUTABLE_DIR, "..", "..") : null;
const nearbySourceExists = Boolean(nearbyWorkerRoot && (0, node_fs_1.existsSync)(node_path_1.default.join(nearbyWorkerRoot, "run.py")) &&
    (0, node_fs_1.existsSync)(node_path_1.default.join(nearbyWorkerRoot, "common", "runner.py")));
let workerRoot = electron_1.app.isPackaged
    ? nearbySourceExists ? nearbyWorkerRoot : bundledWorkerRoot
    : node_path_1.default.resolve(__dirname, "../..");
function ensurePersistentWorkerRoot() {
    if (!electron_1.app.isPackaged || nearbySourceExists || !bundledWorkerRoot)
        return;
    workerRoot = node_path_1.default.join(electron_1.app.getPath("userData"), "worker_plus");
    (0, node_fs_1.mkdirSync)(workerRoot, { recursive: true });
    // Portable Electron unpacks resources into a temporary directory. Keep the
    // worker source and workspaces under userData so tested code fixes survive.
    (0, node_fs_1.cpSync)(bundledWorkerRoot, workerRoot, { recursive: true, force: false, errorOnExist: false });
}
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
let widgetWindow = null;
let widgetVisible = true;
let widgetReady = false;
let quitting = false;
let widgetWatchdog = null;
let widgetLoadRetry = null;
let widgetLoadFailures = 0;
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
function readAutoRepair() {
    const file = node_path_1.default.join(workspace(), "reports", "stage_checks", "auto_code_repair.json");
    try {
        return (0, node_fs_1.existsSync)(file) ? { autoRepair: JSON.parse((0, node_fs_1.readFileSync)(file, "utf8")) } : {};
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
    const outputNames = ["sample.pdf", "sample.pptx", "sample.docx", "final.pdf", "final.pptx", "final.docx", "report_1.pdf", "report_1.docx", "report_2.pdf", "report_2.docx", "report_3.pdf", "report_3.docx"];
    const outputs = Object.fromEntries(outputNames.map(name => [name, (0, node_fs_1.existsSync)(node_path_1.default.join(workspace(), "final", name))]));
    if (!(0, node_fs_1.existsSync)(contextFile()))
        return { running: Boolean(child), cleaning, desktopWidgetVisible: widgetVisible, context: null, workspace: workspace(), outputs, logs: logBuffer };
    try {
        return { running: Boolean(child), cleaning, desktopWidgetVisible: widgetVisible, context: { ...JSON.parse((0, node_fs_1.readFileSync)(contextFile(), "utf8")), ...readUsage(), ...readResearch() }, workflow, workspace: workspace(), outputs, logs: logBuffer, ...readAutoRepair() };
    }
    catch {
        return { running: Boolean(child), cleaning, desktopWidgetVisible: widgetVisible, context: null, workspace: workspace(), outputs, logs: logBuffer };
    }
}
function broadcast(type, value) {
    if (type === "log")
        logBuffer = (logBuffer + String(value)).slice(-100_000);
    if (window && !window.isDestroyed())
        window.webContents.send("worker:event", { type, value });
    if (type !== "log" && widgetWindow && !widgetWindow.isDestroyed())
        widgetWindow.webContents.send("worker:event", { type, value });
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
function run(args, note, entrypoint = "run.py", onExit) {
    if (cleaning)
        throw new Error("پاک‌سازی محلی در حال انجام است.");
    if (child)
        throw new Error("یک اجرا در حال انجام است.");
    logBuffer = "";
    const configuredEnv = envFile();
    const python = configuredEnv.WORKER_PLUS_PYTHON || process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
    if (note?.trim())
        args.push("--operator-note-stdin");
    const spawnedChild = (0, node_child_process_1.spawn)(python, [node_path_1.default.join(workerRoot, entrypoint), ...args], { cwd: workerRoot, windowsHide: true, env: { ...process.env, ...configuredEnv, WORKER_PLUS_NODE: configuredEnv.WORKER_PLUS_NODE || process.env.WORKER_PLUS_NODE || process.execPath, PYTHONUNBUFFERED: "1" } });
    child = spawnedChild;
    broadcast("log", `[worker] starting ${python} ${entrypoint} ${args.join(" ")}\n`);
    spawnedChild.stdout.on("data", data => broadcast("log", data.toString()));
    spawnedChild.stderr.on("data", data => broadcast("log", data.toString()));
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
        onExit?.(code, error);
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
function localReviewWorkspace(selectedOrderId) {
    const id = orderId(selectedOrderId);
    if (!/^[0-9a-f-]{36}$/i.test(id))
        throw new Error("شناسهٔ سفارش معتبر نیست.");
    const root = node_path_1.default.resolve(workerRoot, "workspace");
    for (const candidate of [workspace(), node_path_1.default.join(root, `order_${id}`)]) {
        const resolved = node_path_1.default.resolve(candidate);
        const relative = node_path_1.default.relative(root, resolved);
        if (relative.startsWith("..") || node_path_1.default.isAbsolute(relative))
            continue;
        const contextPath = node_path_1.default.join(resolved, "order_context.json");
        if (!(0, node_fs_1.existsSync)(contextPath))
            continue;
        try {
            if (JSON.parse((0, node_fs_1.readFileSync)(contextPath, "utf8")).order_id === id)
                return resolved;
        }
        catch { /* Try the retained order workspace. */ }
    }
    throw new Error("برای این سفارش اجرای محلی پیدا نشد. ابتدا خروجی سفارش را در Worker Plus بسازید.");
}
function localReviewFile(folder) { return node_path_1.default.join(folder, "reports", "ai_reviews.json"); }
function rawLocalReviews(folder) {
    const file = localReviewFile(folder);
    if (!(0, node_fs_1.existsSync)(file))
        return [];
    const parsed = JSON.parse((0, node_fs_1.readFileSync)(file, "utf8"));
    if (!Array.isArray(parsed?.jobs))
        throw new Error("تاریخچهٔ بازبینی محلی معتبر نیست.");
    return parsed.jobs;
}
function saveLocalReviews(folder, jobs) {
    const save = (targetFolder) => {
        const file = localReviewFile(targetFolder);
        (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(file), { recursive: true });
        const temporary = `${file}.${(0, node_crypto_1.randomUUID)()}.tmp`;
        (0, node_fs_1.writeFileSync)(temporary, JSON.stringify({ jobs }, null, 2), "utf8");
        (0, node_fs_1.renameSync)(temporary, file);
    };
    save(folder);
    const id = jobs[0]?.order_id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
        return;
    const archive = node_path_1.default.join(workerRoot, "workspace", `order_${id}`);
    if (node_path_1.default.resolve(archive) === node_path_1.default.resolve(folder) || !(0, node_fs_1.existsSync)(node_path_1.default.join(archive, "order_context.json")))
        return;
    try {
        if (JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(archive, "order_context.json"), "utf8")).order_id === id)
            save(archive);
    }
    catch { /* Active history remains authoritative if the archive is unavailable. */ }
}
function localReviews(folder) {
    const jobs = rawLocalReviews(folder);
    if (!child && jobs.some(job => job.status === "queued" || job.status === "running")) {
        const now = new Date().toISOString();
        for (const job of jobs)
            if (job.status === "queued" || job.status === "running") {
                job.status = "failed";
                job.error = "Worker Plus پیش از پایان این کار بسته شد؛ دوباره درخواست دهید.";
                job.finished_at = now;
            }
        saveLocalReviews(folder, jobs);
    }
    return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function localOutputHash(folder, order) {
    const name = order.order_type === "ارائه و پاورپوینت" ? "final.pptx" : "final.docx";
    const file = node_path_1.default.join(folder, "final", name);
    if (!(0, node_fs_1.existsSync)(file) || !(0, node_fs_1.statSync)(file).size)
        throw new Error(`فایل ${name} هنوز در خروجی محلی موجود نیست.`);
    return (0, node_crypto_1.createHash)("sha256").update((0, node_fs_1.readFileSync)(file)).digest("hex");
}
function startLocalReview(folder, job) {
    const fail = (message) => {
        const jobs = rawLocalReviews(folder);
        const saved = jobs.find(item => item.id === job.id);
        if (saved && (saved.status === "queued" || saved.status === "running")) {
            saved.status = "failed";
            saved.error = message;
            saved.finished_at = new Date().toISOString();
            saveLocalReviews(folder, jobs);
        }
    };
    try {
        run(["--local-job-id", job.id, "--local-workspace", folder], undefined, "ai_review.py", (code, error) => {
            if (code !== 0 || error)
                fail(error?.message || `پردازش بازبینی با کد ${code} متوقف شد.`);
        });
    }
    catch (error) {
        fail(error instanceof Error ? error.message : String(error));
        throw error;
    }
}
function queueLocalReview(selectedOrderId) {
    const folder = localReviewWorkspace(selectedOrderId);
    if (child || cleaning)
        throw new Error("ابتدا منتظر پایان اجرای فعال Worker Plus بمانید.");
    const context = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(folder, "order_context.json"), "utf8"));
    if (!context.completed_steps?.includes("10_validate_and_publish"))
        throw new Error("ابتدا خروجی نهایی سفارش را کامل کنید.");
    const jobs = localReviews(folder);
    if (jobs.some(job => job.status === "queued" || job.status === "running"))
        throw new Error("بازبینی یا اصلاح قبلی هنوز در جریان است.");
    const now = new Date().toISOString();
    const job = { id: (0, node_crypto_1.randomUUID)(), order_id: context.order_id, action: "review", status: "queued",
        parent_review_id: null, score: null, report: null, fix_prompt: null, requested_prompt: null,
        applied_files: [], restart_step: null, error: null, created_at: now, started_at: null, finished_at: null,
        output_sha256: localOutputHash(folder, context.order || {}) };
    saveLocalReviews(folder, [job, ...jobs]);
    startLocalReview(folder, job);
    return job;
}
function queueLocalFix(selectedOrderId, reviewId, prompt) {
    const folder = localReviewWorkspace(selectedOrderId);
    if (child || cleaning)
        throw new Error("ابتدا منتظر پایان اجرای فعال Worker Plus بمانید.");
    const guidance = prompt.trim();
    if (guidance.length < 20 || guidance.length > 20_000)
        throw new Error("متن اصلاح باید بین ۲۰ تا ۲۰٬۰۰۰ نویسه باشد.");
    const jobs = localReviews(folder);
    const review = jobs.find(job => job.id === reviewId && job.action === "review" && job.status === "completed");
    if (!review)
        throw new Error("بازبینی کامل‌شده پیدا نشد.");
    if (jobs.some(job => job.status === "queued" || job.status === "running" ||
        (job.action === "fix" && job.parent_review_id === reviewId && job.status === "completed")))
        throw new Error("اصلاح این بازبینی قبلاً ثبت شده یا کاری در جریان است.");
    const context = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(folder, "order_context.json"), "utf8"));
    if (localOutputHash(folder, context.order || {}) !== review.output_sha256)
        throw new Error("خروجی از زمان بازبینی تغییر کرده است؛ ابتدا نسخهٔ جدید را بازبینی کنید.");
    const job = { id: (0, node_crypto_1.randomUUID)(), order_id: review.order_id, action: "fix", status: "queued",
        parent_review_id: review.id, score: null, report: null, fix_prompt: null, requested_prompt: guidance,
        applied_files: [], restart_step: null, error: null, created_at: new Date().toISOString(), started_at: null, finished_at: null };
    saveLocalReviews(folder, [job, ...jobs]);
    startLocalReview(folder, job);
    return job;
}
function createWindow() {
    window = new electron_1.BrowserWindow({ width: 1280, height: 840, minWidth: 980, minHeight: 680, icon: appIcon, backgroundColor: "#f3f4f6", webPreferences: { preload: node_path_1.default.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
    if (process.env.VITE_DEV_SERVER_URL)
        window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else
        window.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"));
    window.on("restore", restoreWidget);
    window.on("focus", restoreWidget);
    window.on("closed", () => { window = null; widgetReady = false; widgetWindow?.destroy(); widgetWindow = null; });
}
function raiseWidget() {
    const widget = widgetWindow;
    if (quitting || !widgetVisible || !widget || widget.isDestroyed() || !widget.isVisible())
        return;
    // On Windows showInactive/OS desktop transitions can lose WS_EX_TOPMOST
    // while Electron still remembers the requested z-order. Force the native
    // transition after showing/resizing; moveTop never takes keyboard focus.
    if (process.platform === "win32")
        widget.setAlwaysOnTop(false);
    widget.setAlwaysOnTop(true, "floating");
    widget.moveTop();
}
function restoreWidget() {
    if (quitting || !widgetVisible || !window || window.isDestroyed())
        return;
    if (!widgetWindow || widgetWindow.isDestroyed()) {
        createWidget();
        return;
    }
    if (!widgetReady)
        return;
    if (widgetWindow.isMinimized())
        widgetWindow.restore();
    const size = widgetWindow.getBounds();
    positionWidget(size.width, size.height);
    if (!widgetWindow.isVisible())
        widgetWindow.showInactive();
    raiseWidget();
}
function positionWidget(width = 376, height = 120) {
    if (!widgetWindow || widgetWindow.isDestroyed())
        return;
    const display = window && !window.isDestroyed() ? electron_1.screen.getDisplayMatching(window.getBounds()) : electron_1.screen.getPrimaryDisplay();
    const area = display.workArea;
    const w = Math.min(Math.max(220, Math.ceil(width)), 400, area.width - 16);
    const h = Math.min(Math.max(68, Math.ceil(height)), 520, area.height - 16);
    widgetWindow.setBounds({ width: w, height: h, x: area.x + area.width - w - 8, y: area.y + area.height - h - 8 });
}
function createWidget() {
    if (quitting || (widgetWindow && !widgetWindow.isDestroyed()))
        return;
    widgetReady = false;
    // No parent: minimizing the main window must leave this window on the desktop.
    const widget = new electron_1.BrowserWindow({ width: 376, height: 120, frame: false, transparent: true,
        alwaysOnTop: true, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
        fullscreenable: false, show: false, hasShadow: false, title: "Daneshyar · وضعیت اجرا",
        webPreferences: { preload: node_path_1.default.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    widgetWindow = widget;
    widget.on("close", event => {
        if (quitting)
            return;
        event.preventDefault();
        widgetVisible = false;
        widget.hide();
        broadcast("state", state());
    });
    widget.on("closed", () => {
        if (widgetWindow === widget) {
            widgetWindow = null;
            widgetReady = false;
            if (widgetLoadRetry) {
                clearTimeout(widgetLoadRetry);
                widgetLoadRetry = null;
            }
        }
        if (!quitting && widgetVisible && window && !window.isDestroyed())
            setTimeout(restoreWidget, 250).unref();
    });
    widget.on("hide", () => {
        if (!quitting && widgetVisible && widgetReady)
            setTimeout(restoreWidget, 100).unref();
    });
    const loaded = () => {
        if (widget !== widgetWindow || widget.isDestroyed())
            return;
        widgetReady = true;
        widgetLoadFailures = 0;
        if (widgetLoadRetry) {
            clearTimeout(widgetLoadRetry);
            widgetLoadRetry = null;
        }
        restoreWidget();
    };
    const retryLoad = () => {
        if (quitting || widget !== widgetWindow || widget.isDestroyed() || widgetLoadRetry)
            return;
        widgetReady = false;
        widgetLoadRetry = setTimeout(() => {
            widgetLoadRetry = null;
            if (!quitting && widget === widgetWindow && !widget.isDestroyed())
                loadWidget();
        }, Math.min(30_000, 1000 * 2 ** Math.min(widgetLoadFailures++, 5)));
        widgetLoadRetry.unref();
    };
    const loadWidget = () => {
        if (process.env.VITE_DEV_SERVER_URL) {
            const url = new URL(process.env.VITE_DEV_SERVER_URL);
            url.hash = "run-widget";
            void widget.loadURL(url.toString()).catch(retryLoad);
        }
        else
            void widget.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"), { hash: "run-widget" }).catch(retryLoad);
    };
    widget.once("ready-to-show", loaded);
    widget.webContents.on("did-finish-load", loaded);
    widget.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3)
            retryLoad();
    });
    widget.webContents.on("render-process-gone", (_event, details) => {
        broadcast("log", `[widget] renderer stopped (${details.reason}); reloading the status window\n`);
        retryLoad();
    });
    positionWidget();
    loadWidget();
}
electron_1.app.whenReady().then(() => {
    ensurePersistentWorkerRoot();
    electron_1.ipcMain.handle("widget:resize", (event, size) => {
        if (event.sender !== widgetWindow?.webContents || !Number.isFinite(size?.width) || !Number.isFinite(size?.height))
            return;
        positionWidget(size.width, size.height);
        raiseWidget();
    });
    electron_1.ipcMain.handle("widget:toggle", () => {
        widgetVisible = !widgetVisible;
        if (widgetVisible)
            restoreWidget();
        else
            widgetWindow?.hide();
        broadcast("state", state());
        return widgetVisible;
    });
    electron_1.ipcMain.handle("widget:show-main", () => {
        if (window?.isMinimized())
            window.restore();
        window?.show();
        window?.focus();
    });
    electron_1.ipcMain.handle("order:lookup", async (_event, value) => {
        const id = orderId(value);
        const config = settings();
        const response = await fetch(`${config.backend}/api/worker/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(String(payload.detail || `خطای backend (${response.status})`));
        return { id, order: payload };
    });
    electron_1.ipcMain.handle("order:download-file", async (_event, selectedOrderId, collection, fileId) => {
        if (!["files", "final_outputs", "payment_notes"].includes(collection))
            throw new Error("نوع فایل سفارش معتبر نیست.");
        const id = orderId(selectedOrderId);
        const config = settings();
        const orderResponse = await fetch(`${config.backend}/api/worker/orders/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${config.apiKey}` }
        });
        const orderPayload = await orderResponse.json().catch(() => ({}));
        if (!orderResponse.ok)
            throw new Error(String(orderPayload.detail || `خطای backend (${orderResponse.status})`));
        const entries = Array.isArray(orderPayload[collection]) ? orderPayload[collection] : [];
        const file = entries.find((entry) => entry?.id === fileId);
        if (!file || typeof file.storage_path !== "string")
            throw new Error("فایل در این سفارش پیدا نشد.");
        const storagePath = file.storage_path;
        if (!storagePath.startsWith(`orders/${id}/`) || storagePath.split("/").some((part) => !part || part === "." || part === ".."))
            throw new Error("مسیر فایل سفارش معتبر نیست.");
        const rawName = String(file.original_name || file.stored_name || "download.bin");
        const suggestedName = rawName.replaceAll("\\", "/").split("/").pop()?.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "download.bin";
        const options = { title: "ذخیرهٔ فایل سفارش", defaultPath: suggestedName, buttonLabel: "دانلود" };
        const save = window ? await electron_1.dialog.showSaveDialog(window, options) : await electron_1.dialog.showSaveDialog(options);
        if (save.canceled || !save.filePath)
            return { saved: false };
        const url = `${config.backend}/uploads/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${config.apiKey}` } });
        if (!response.ok)
            throw new Error(`دریافت فایل از وب‌سایت ناموفق بود (${response.status}).`);
        await (0, promises_1.writeFile)(save.filePath, Buffer.from(await response.arrayBuffer()));
        return { saved: true, path: save.filePath };
    });
    electron_1.ipcMain.handle("ai-review:list", (_event, selectedOrderId) => localReviews(localReviewWorkspace(selectedOrderId)));
    electron_1.ipcMain.handle("ai-review:start", (_event, selectedOrderId) => queueLocalReview(selectedOrderId));
    electron_1.ipcMain.handle("ai-review:fix", (_event, selectedOrderId, reviewId, prompt) => queueLocalFix(selectedOrderId, reviewId, prompt));
    electron_1.ipcMain.handle("worker:state", () => state());
    electron_1.ipcMain.handle("presentation:preview", (_event, expectedOrder, number) => (0, presentation_preview_1.presentationPreview)(workspace(), expectedOrder, number));
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
        if (options.autoRepair) {
            if (!options.step)
                throw new Error("اصلاح خودکار فقط برای مرحلهٔ پیشنهادی یک اجرای ذخیره‌شده مجاز است.");
            args.push("--auto-repair");
        }
        args.push(options.offline ? "--offline" : "--online");
        if (options.sample)
            args.push("--sample");
        return run(args, options.note);
    });
    electron_1.ipcMain.handle("worker:publish-local", (_event, expectedOrderId) => {
        const current = state().context;
        if (!expectedOrderId || current?.order_id !== expectedOrderId || current.status !== "dry_run_complete" || !current.completed_steps?.includes("10_validate_and_publish")) {
            throw new Error("فقط بستهٔ محلیِ کامل‌شده برای سفارش فعلی قابل انتشار است.");
        }
        return run(["--publish-local", expectedOrderId]);
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
        const allowed = new Set(["sample.pdf", "sample.pptx", "sample.docx", "final.pdf", "final.pptx", "final.docx", "report_1.pdf", "report_1.docx", "report_2.pdf", "report_2.docx", "report_3.pdf", "report_3.docx"]);
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
    createWidget();
    stateTimer = setInterval(() => broadcast("state", state()), 750);
    stateTimer.unref();
    widgetWatchdog = setInterval(restoreWidget, 5000);
    widgetWatchdog.unref();
    electron_1.screen.on("display-metrics-changed", restoreWidget);
    electron_1.screen.on("display-removed", restoreWidget);
    electron_1.screen.on("display-added", restoreWidget);
    electron_1.powerMonitor.on("resume", restoreWidget);
    electron_1.powerMonitor.on("unlock-screen", restoreWidget);
    electron_1.app.on("activate", () => { if (!window) {
        createWindow();
        createWidget();
    } });
});
electron_1.app.on("before-quit", () => {
    quitting = true;
    if (stateTimer)
        clearInterval(stateTimer);
    if (widgetWatchdog)
        clearInterval(widgetWatchdog);
    if (widgetLoadRetry)
        clearTimeout(widgetLoadRetry);
});
electron_1.app.on("window-all-closed", () => { if (process.platform !== "darwin")
    electron_1.app.quit(); });
