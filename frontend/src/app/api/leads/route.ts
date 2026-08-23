import { createConsultationUser } from "../../../server/leads";
import { ApiError, errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site requests are not accepted");
    }
    const user = await createConsultationUser(await request.json());
    return json({
      id: user.id,
      message: "درخواست مشاوره شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم."
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
