import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { absoluteStoragePath } from "../../../server/files";
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
    const buffer = await fs.readFile(absoluteStoragePath(storagePath)).catch(() => null);
    if (!buffer) {
      throw new ApiError(404, "Stored file not found");
    }
    return new NextResponse(buffer);
  } catch (error) {
    return errorResponse(error);
  }
}
