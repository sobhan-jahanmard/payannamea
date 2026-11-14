import { createAdvertisingCampaign, getAdvertisingDashboard, updateAdvertisingCampaign } from "../../../../server/advertising";
import { requireAdmin } from "../../../../server/auth";
import { ApiError, errorResponse, json } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function campaignBody(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "درخواست باید از پنل دانشیار ارسال شود.");
  }
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(415, "نوع داده‌های انتشار معتبر نیست.");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "داده‌های انتشار معتبر نیست.");
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const response = json(await getAdvertisingDashboard());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    return json(await createAdvertisingCampaign(await campaignBody(request)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    return json(await updateAdvertisingCampaign(await campaignBody(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
