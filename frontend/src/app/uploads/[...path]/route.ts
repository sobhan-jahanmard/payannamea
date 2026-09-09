import { NextResponse } from "next/server";

import { readStoredUpload } from "../../../server/files";
import { ApiError, errorResponse } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ path: string[] }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const storagePath = path.join("/");
    const stored = await readStoredUpload(storagePath);
    if (!stored) {
      throw new ApiError(404, "Stored file not found");
    }
    return new NextResponse(new Uint8Array(stored.body), {
      headers: stored.contentType ? { "Content-Type": stored.contentType } : undefined
    });
  } catch (error) {
    return errorResponse(error);
  }
}
