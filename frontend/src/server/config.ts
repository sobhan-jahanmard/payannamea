import path from "node:path";

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function databaseUrl(): string {
  const rawUrl = getRequiredEnv("DATABASE_URL");
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("sslcert");
  parsed.searchParams.delete("sslkey");
  parsed.searchParams.delete("sslrootcert");
  const url = parsed.toString();
  if (url.startsWith("postgres://")) {
    return `postgresql://${url.slice("postgres://".length)}`;
  }
  return url;
}

export function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() || "local-dev-auth-secret-change-me";
}

export function workerApiKey(): string {
  return process.env.WORKER_API_KEY?.trim() || "local-worker-dev-key";
}

export function workerLockMinutes(): number {
  return Number(process.env.WORKER_LOCK_MINUTES || 60);
}

export function maxUploadSizeMb(): number {
  return Number(process.env.MAX_UPLOAD_SIZE_MB || 50);
}

export function storageDir(): string {
  const configured = process.env.STORAGE_DIR?.trim() || "storage";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

export function appEnvironment(): string {
  return process.env.NODE_ENV || "development";
}
