import { requireFollowupAccess } from "../../../server/auth";
import { findPhoneFollowup, updatePhoneFollowup } from "../../../server/followup";
import { errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireFollowupAccess(request);
    return json(await findPhoneFollowup(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireFollowupAccess(request);
    return json(await updatePhoneFollowup(await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
