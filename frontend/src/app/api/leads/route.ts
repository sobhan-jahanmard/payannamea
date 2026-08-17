import { createConsultationLead } from "../../../server/leads";
import { ApiError, errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site requests are not accepted");
    }
    const lead = await createConsultationLead(await request.json());
    return json({
      id: lead.id,
      message: "درخواست مشاوره شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم."
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
