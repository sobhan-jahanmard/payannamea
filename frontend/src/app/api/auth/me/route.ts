import { getCurrentUser } from "../../../../server/auth";
import { errorResponse, json } from "../../../../server/http";
import { serializeUser } from "../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return json(serializeUser(await getCurrentUser(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
