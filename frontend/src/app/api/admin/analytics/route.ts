import { requireAdmin } from "../../../../server/auth";
import { analyticsQuerySchema, getAnalyticsDashboard } from "../../../../server/analytics";
import { errorResponse, json } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const query = analyticsQuerySchema.parse(Object.fromEntries(url.searchParams));
    return json(await getAnalyticsDashboard(query));
  } catch (error) {
    return errorResponse(error);
  }
}
