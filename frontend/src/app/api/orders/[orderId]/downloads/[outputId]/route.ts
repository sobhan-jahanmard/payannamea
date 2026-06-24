import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { absoluteStoragePath } from "../../../../../../server/files";
import { ApiError, errorResponse } from "../../../../../../server/http";
import { customerOutputFileName, findFinalOutput } from "../../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string; outputId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { orderId, outputId } = await context.params;
    const output = await findFinalOutput(orderId, outputId);
    const filePath = absoluteStoragePath(output.storage_path);
    const buffer = await fs.readFile(filePath).catch(() => null);
    if (!buffer) {
      throw new ApiError(404, "Stored file not found");
    }

    const headers = new Headers();
    const downloadName = ["docx", "pdf", "deliverable_source"].includes(output.output_type)
      ? customerOutputFileName(orderId, output)
      : path.basename(output.original_name);
    headers.set("Content-Type", output.content_type || "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${downloadName.replaceAll('"', "")}"`
    );
    return new NextResponse(buffer, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
