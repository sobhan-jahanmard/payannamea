import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { maxUploadSizeMb, storageDir } from "./config";
import { ApiError } from "./http";

export interface StoredUpload {
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number;
}

export function safeFilename(filename: string): string {
  const name = path.basename(filename || "upload.bin").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return name || "upload.bin";
}

export async function saveUpload(file: File, directory: string): Promise<StoredUpload> {
  const originalName = file.name || "upload.bin";
  const storedName = `${randomUUID()}-${safeFilename(originalName)}`;
  const relativePath = path.posix.join(directory, storedName);
  const absolutePath = path.join(storageDir(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const maxBytes = maxUploadSizeMb() * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(413, `Upload exceeds ${maxUploadSizeMb()} MB limit`);
  }

  await fs.writeFile(absolutePath, buffer);
  return {
    original_name: originalName,
    stored_name: storedName,
    storage_path: relativePath,
    content_type: file.type || null,
    size_bytes: buffer.byteLength
  };
}

export function absoluteStoragePath(storagePath: string): string {
  const normalized = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(storageDir(), normalized);
}

export async function deleteStoredUpload(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) {
    return;
  }
  try {
    await fs.unlink(absoluteStoragePath(storagePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
