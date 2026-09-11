import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../../../server/auth";
import { readStoredUpload } from "../../../../../../server/files";
import { ApiError, errorResponse } from "../../../../../../server/http";
import { customerOutputFileName, findFinalOutput, getOrderForUserOr404, getOrderOr404 } from "../../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string; outputId: string }>;
}

export async function GET(request: Request, context: Context) {
  try {
    const { orderId, outputId } = await context.params;
    const user = await getCurrentUser(request);
    let customerOrder: Awaited<ReturnType<typeof getOrderForUserOr404>> | null = null;
    if (user.role === "admin") {
      await getOrderOr404(orderId);
    } else {
      customerOrder = await getOrderForUserOr404(orderId, user);
      if (!["completed", "sample_pending_customer_approval", "sample_revision_required"].includes(customerOrder.status)) {
        throw new ApiError(403, "This output is not available at the current order stage");
      }
    }
    const output = await findFinalOutput(orderId, outputId);
    if (customerOrder && customerOrder.status !== "completed" && output.output_type !== "sample") {
      throw new ApiError(403, "Only the sample output is available before completion");
    }
    const stored = await readStoredUpload(output.storage_path);
    if (!stored) {
      throw new ApiError(404, "Stored file not found");
    }

    const headers = new Headers();
    const downloadName = ["docx", "pdf", "deliverable_source"].includes(output.output_type)
      ? customerOutputFileName(orderId, output)
      : path.basename(output.original_name);
    headers.set("Content-Type", output.content_type || stored.contentType || "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${downloadName.replaceAll('"', "")}"`
    );
    return new NextResponse(new Uint8Array(stored.body), { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
