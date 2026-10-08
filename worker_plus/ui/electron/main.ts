import { app, BrowserWindow, ipcMain, shell } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanupWorkspace, type CleanupOptions } from "./cleanup";

const workerRoot = app.isPackaged ? path.join(process.resourcesPath, "worker_plus") : path.resolve(__dirname, "../..");
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, "daneshyar-logo.png")
  : path.resolve(__dirname, "../../../frontend/public/images/daneshyar-logo.png");
function workspace(): string {
  const root = path.join(workerRoot, "workspace");
  try {
    const pointer = JSON.parse(readFileSync(path.join(root, "active.json"), "utf8"));
    const resolved = path.resolve(root, String(pointer.path));
    const relative = path.relative(root, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) return resolved;
  } catch { /* Legacy workspace remains available for resume. */ }
  return path.join(root, "in_progress");
}
function contextFile() { return path.join(workspace(), "order_context.json"); }
let window: BrowserWindow | null = null;
let child: ChildProcessWithoutNullStreams | null = null;
let stateTimer: NodeJS.Timeout | null = null;
let logBuffer = "";
let cleaning = false;

function envFile(): Record<string, string> {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const candidates = app.isPackaged
    ? [
        portableDir && path.resolve(portableDir, "..", "..", ".env"),
        portableDir && path.join(portableDir, ".env"),
        path.join(path.dirname(process.execPath), ".env"),
        path.join(workerRoot, ".env"),
      ]
    : [path.join(workerRoot, ".env")];
  const file = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!file) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
    const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['\"]|['\"]$/g, "")];
  }));
}

function settings() {
  const values = envFile();
  return { backend: (values.BACKEND_URL || "https://daneshyar.vercel.app").replace(/\/$/, ""), apiKey: values.WORKER_API_KEY || "local-worker-dev-key" };
}

function orderId(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("لینک یا شناسه سفارش را وارد کنید.");
  try {
    const url = new URL(clean);
    const segments = url.pathname.split("/").filter(Boolean);
    const marker = segments.findIndex(segment => segment === "orders" || segment === "order");
    return decodeURIComponent(marker >= 0 && segments[marker + 1] ? segments[marker + 1] : segments.at(-1) || "");
  } catch { return clean; }
}

function readUsage() {
  const file = path.join(workspace(), "telemetry", "summary.json");
  try { return existsSync(file) ? { usage: JSON.parse(readFileSync(file, "utf8")) } : {}; }
  catch { return {}; }
}

function state() {
  const catalog = path.join(workspace(), "reports", "workflow_artifacts.json");
  let workflow: unknown;
  try { if (existsSync(catalog)) workflow = JSON.parse(readFileSync(catalog, "utf8")); } catch { /* Atomic writer may be replacing the projection. */ }
  const outputNames = ["sample.pdf", "sample.docx", "final.pdf", "final.docx"];
  const outputs = Object.fromEntries(outputNames.map(name => [name, existsSync(path.join(workspace(), "final", name))]));
  if (!existsSync(contextFile())) return { running: Boolean(child), cleaning, context: null, workspace: workspace(), outputs, logs: logBuffer };
  try { return { running: Boolean(child), cleaning, context: { ...JSON.parse(readFileSync(contextFile(), "utf8")), ...readUsage() }, workflow, workspace: workspace(), outputs, logs: logBuffer }; }
  catch { return { running: Boolean(child), cleaning, context: null, workspace: workspace(), outputs, logs: logBuffer }; }
}

function broadcast(type: "log" | "exit" | "state", value: unknown) {
  if (type === "log") logBuffer = (logBuffer + String(value)).slice(-100_000);
  window?.webContents.send("worker:event", { type, value });
}

function waitForExit(target: ChildProcessWithoutNullStreams, timeoutMs = 5000) {
  if (target.exitCode !== null || target.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Worker PID ${target.pid ?? "unknown"} did not exit within ${timeoutMs}ms.`));
    }, timeoutMs);
    const onExit = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timer);
      target.off("exit", onExit);
      target.off("error", onError);
    };
    target.once("exit", onExit);
    target.once("error", onError);
  });
}

function run(args: string[], note?: string) {
  if (cleaning) throw new Error("پاک‌سازی محلی در حال انجام است.");
  if (child) throw new Error("یک اجرا در حال انجام است.");
  logBuffer = "";
  const configuredEnv = envFile();
  const python = configuredEnv.WORKER_PLUS_PYTHON || process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
  if (note?.trim()) args.push("--operator-note-stdin");
  const spawnedChild = spawn(python, [path.join(workerRoot, "run.py"), ...args], { cwd: workerRoot, windowsHide: true, env: { ...process.env, ...configuredEnv, PYTHONUNBUFFERED: "1" } });
  child = spawnedChild;
  broadcast("log", `[worker] starting ${python} run.py ${args.join(" ")}\n`);
  spawnedChild.stdout.on("data", data => broadcast("log", data.toString()));
  spawnedChild.stderr.on("data", data => broadcast("log", data.toString()));
  stateTimer = setInterval(() => broadcast("state", state()), 750);
  let finished = false;
  const finish = (code: number | null, signal: NodeJS.Signals | null, error?: Error) => {
    if (finished) return;
    finished = true;
    if (error) broadcast("log", `[worker] failed to start: ${error.message}\n`);
    else broadcast("log", `[worker] exited (code=${code ?? "null"}, signal=${signal ?? "none"})\n`);
    if (child === spawnedChild) child = null;
    if (stateTimer) clearInterval(stateTimer);
    stateTimer = null;
    broadcast("exit", { code, signal, error: error?.message }); broadcast("state", state());
  };
  spawnedChild.on("error", error => finish(null, null, error));
  spawnedChild.on("exit", (code, signal) => finish(code, signal));
  spawnedChild.stdin.on("error", error => broadcast("log", `[worker] guidance input failed: ${error.message}\n`));
  spawnedChild.stdin.end(note?.trim() || "", "utf8");
  broadcast("state", state());
  return { started: true };
}

function createWindow() {
  window = new BrowserWindow({ width: 1280, height: 840, minWidth: 980, minHeight: 680, icon: appIcon, backgroundColor: "#f3f4f6", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  if (process.env.VITE_DEV_SERVER_URL) window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else window.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("order:lookup", async (_event, value: string) => {
    const id = orderId(value); const config = settings();
    const response = await fetch(`${config.backend}/api/worker/orders/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload.detail || `خطای backend (${response.status})`));
    return { id, order: payload };
  });
  ipcMain.handle("worker:state", () => state());
  ipcMain.handle("worker:reset", async (_event, options: CleanupOptions) => {
    if (child || cleaning) throw new Error("ابتدا اجرای فعال را متوقف کنید و منتظر پایان آن بمانید.");
    const saved = state();
    if (!options?.orderId || saved.context?.order_id !== options.orderId || saved.workspace !== options.workspace) throw new Error("پاک‌سازی فقط برای اجرای محلی همین سفارش مجاز است؛ وضعیت برنامه را تازه‌سازی کنید.");
    cleaning = true;
    broadcast("state", state());
    try {
      const configuredEnv = envFile();
      const python = configuredEnv.WORKER_PLUS_PYTHON || process.env.WORKER_PLUS_PYTHON || (process.platform === "win32" ? "python" : "python3");
      const result = await cleanupWorkspace(workerRoot, python, { ...process.env, ...configuredEnv }, options);
      logBuffer = "";
      return result;
    } finally {
      cleaning = false;
      broadcast("state", state());
    }
  });
  ipcMain.handle("worker:start", (_event, options: { orderId: string; offline: boolean; sample: boolean; step?: number; note?: string }) => {
    if (options.step) {
      const savedOrderId = state().context?.order_id;
      if (savedOrderId !== options.orderId) throw new Error("اجرای مرحله‌ای فقط برای سفارش موجود در workspace فعلی مجاز است. ابتدا اجرای کامل این سفارش را شروع کنید.");
    }
    const args = options.step ? ["--step", String(options.step)] : ["--order-id", options.orderId];
    args.push(options.offline ? "--offline" : "--online"); if (options.sample) args.push("--sample");
    return run(args, options.note);
  });
  ipcMain.handle("worker:resume", (_event, note?: string) => run(["--resume"], note));
  ipcMain.handle("worker:stop", async () => {
    if (!child) return false;
    const target = child;
    const pid = target.pid;
    if (!pid) throw new Error("Worker process has no PID and cannot be stopped.");
    broadcast("log", `[worker] stop requested for PID ${pid}\n`);
    if (process.platform === "win32") {
      await new Promise<void>((resolve, reject) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
        let output = "";
        killer.stdout.on("data", data => { output += data.toString(); });
        killer.stderr.on("data", data => { output += data.toString(); });
        killer.on("error", reject);
        killer.on("exit", code => {
          if (output.trim()) broadcast("log", `[worker] taskkill: ${output.trim()}\n`);
          if (code === 0) resolve();
          else reject(new Error(`taskkill failed with exit code ${code}${output.trim() ? `: ${output.trim()}` : ""}`));
        });
      });
      await waitForExit(target);
      broadcast("log", `[worker] PID ${pid} stopped\n`);
      return true;
    }
    const stopped = target.kill("SIGTERM");
    if (!stopped) throw new Error("Worker process did not accept SIGTERM.");
    await waitForExit(target);
    broadcast("log", `[worker] PID ${pid} stopped\n`);
    return true;
  });
  ipcMain.handle("worker:open-workspace", async () => { await shell.openPath(workspace()); });
  ipcMain.handle("worker:open-report", async (_event, relativePath: string) => {
    const root = path.resolve(workspace());
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target).replace(/\\/g, "/");
    if (!["reports/", "research/", "analysis/", "datasets/"].some(prefix => relative.startsWith(prefix)) || relative.includes("../") || !existsSync(target)) throw new Error("گزارش خطا در workspace موجود نیست.");
    const result = await shell.openPath(target);
    if (result) throw new Error(result);
  });
  ipcMain.handle("worker:open-artifact", async (_event, relativePath: string) => {
    const root = path.resolve(workspace());
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target).replace(/\\/g, "/");
    if (!["artifacts/", "reports/"].some(prefix => relative.startsWith(prefix)) || relative.includes("../") || !existsSync(target) || ![".json", ".md", ".txt", ".csv", ".png", ".docx", ".pdf", ".xlsx"].includes(path.extname(target).toLowerCase())) throw new Error("فایل ثبت‌شده در workspace موجود نیست.");
    const result = await shell.openPath(target);
    if (result) throw new Error(result);
  });
  ipcMain.handle("worker:open-output", async (_event, name: string) => {
    const allowed = new Set(["sample.pdf", "sample.docx", "final.pdf", "final.docx"]);
    if (!allowed.has(name)) throw new Error("نام فایل خروجی معتبر نیست.");
    const target = path.join(workspace(), "final", name);
    if (!existsSync(target)) throw new Error(`فایل ${name} هنوز ساخته نشده است.`);
    const result = await shell.openPath(target);
    if (!result) return { path: target };
    // Some Linux desktop environments do not report a registered application
    // through openPath even though xdg-open can resolve one. Try the native
    // desktop opener before surfacing the original error.
    const opener = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const opened = spawn(opener, [target], { detached: true, windowsHide: true, stdio: "ignore" });
    opened.unref();
    return { path: target, fallback: true };
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
