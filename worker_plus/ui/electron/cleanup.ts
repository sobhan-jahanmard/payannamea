import { spawn } from "node:child_process";

export type CleanupOptions = { orderId: string; workspace: string };
export type CleanupResult = { reset: true; files_removed: number; workspace: string };

export function cleanupWorkspace(workerRoot: string, python: string, env: NodeJS.ProcessEnv, options: CleanupOptions): Promise<CleanupResult> {
  return new Promise((resolve, reject) => {
    const process = spawn(python, ["-m", "common.workspace_cleanup", "--order-id", options.orderId, "--workspace", options.workspace], {
      cwd: workerRoot, windowsHide: true, env: { ...env, PYTHONIOENCODING: "utf-8" }
    });
    let output = "";
    let errors = "";
    process.stdout.on("data", data => { output += data.toString(); });
    process.stderr.on("data", data => { errors += data.toString(); });
    process.on("error", error => reject(new Error(`شروع پاک‌سازی محلی ممکن نشد: ${error.message}`)));
    process.on("close", code => {
      if (code !== 0) { reject(new Error(errors.trim() || `پاک‌سازی محلی کامل نشد (${code}).`)); return; }
      try {
        const result = JSON.parse(output) as CleanupResult;
        if (result.reset !== true || typeof result.files_removed !== "number" || typeof result.workspace !== "string") throw new Error("Invalid cleanup result");
        resolve(result);
      } catch { reject(new Error("نتیجهٔ پاک‌سازی محلی قابل‌خواندن نیست؛ وضعیت workspace را بررسی کنید.")); }
    });
  });
}
