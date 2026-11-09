import { getCurrentUser } from "../../../server/auth";
import { CONSULTATION_ALREADY_REGISTERED, CONSULTATION_REGISTERED } from "../../../lib/phone-auth-schema";
import { createConsultationUser } from "../../../server/leads";
import { ApiError, errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site requests are not accepted");
    }
    const currentUser = await getCurrentUser(request);
    if (!currentUser.phone || currentUser.role !== "customer") {
      throw new ApiError(403, "برای درخواست مشاوره با شماره موبایل مشتری وارد شوید");
    }
    const payload = await request.json();
    const { user, repeated } = await createConsultationUser({ ...payload, phone: currentUser.phone });
    return json({
      id: user.id,
      message: repeated ? CONSULTATION_ALREADY_REGISTERED : CONSULTATION_REGISTERED
    }, repeated ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
