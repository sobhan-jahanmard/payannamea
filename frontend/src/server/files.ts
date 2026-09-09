import { randomUUID } from "node:crypto";

import { maxUploadSizeMb, supabaseServiceRoleKey, supabaseStorageBucket, supabaseStorageUrl } from "./config";
import { ApiError } from "./http";

export interface StoredUpload {
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number;
}

export function safeFilename(filename: string): string {
  const name = (filename || "upload.bin").split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return name || "upload.bin";
}

function storageConfig(): { url: string; key: string } {
  const url = supabaseStorageUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) {
    throw new ApiError(500, "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url, key };
}

export async function saveUpload(file: File, directory: string): Promise<StoredUpload> {
  const originalName = file.name || "upload.bin";
  const storedName = `${randomUUID()}-${safeFilename(originalName)}`;
  const relativePath = `${directory.replace(/\/+$/, "")}/${storedName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const maxBytes = maxUploadSizeMb() * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(413, `Upload exceeds ${maxUploadSizeMb()} MB limit`);
  }

  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${supabaseStorageBucket()}/${encodeStoragePath(relativePath)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false"
    },
    body: buffer
  });
  if (!response.ok) {
    throw new ApiError(502, `Supabase Storage upload failed: ${await response.text()}`);
  }

  return {
    original_name: originalName,
    stored_name: storedName,
    storage_path: relativePath,
    content_type: file.type || null,
    size_bytes: buffer.byteLength
  };
}

function encodeStoragePath(storagePath: string): string {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export async function readStoredUpload(storagePath: string): Promise<{ body: Buffer; contentType: string | null } | null> {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${supabaseStorageBucket()}/${encodeStoragePath(storagePath)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(502, `Supabase Storage download failed: ${await response.text()}`);
  return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
}

export async function deleteStoredUpload(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) {
    return;
  }
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${supabaseStorageBucket()}/${encodeStoragePath(storagePath)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, apikey: key }
  });
  if (!response.ok && response.status !== 404) {
    throw new ApiError(502, `Supabase Storage delete failed: ${await response.text()}`);
  }
}
