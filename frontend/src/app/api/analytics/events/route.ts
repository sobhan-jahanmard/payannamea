import { recordAnalyticsEvent } from "../../../../server/analytics";
import { ApiError, errorResponse, json } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Cross-site analytics events are not accepted");
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_384) {
      throw new ApiError(413, "Analytics event is too large");
    }

    const text = await request.text();
    if (text.length > 16_384) {
      throw new ApiError(413, "Analytics event is too large");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(400, "Invalid analytics event JSON");
    }
    await recordAnalyticsEvent(payload);
    return json({ accepted: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
