import { requireFollowupAccess } from "../../../server/auth";
import {
  findPhoneFollowup,
  listNewFollowups,
  newFollowupsQuerySchema,
  updatePhoneFollowup,
} from "../../../server/followup";
import { errorResponse, json } from "../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireFollowupAccess(request);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    if (query.list === "new") {
      return json(await listNewFollowups(newFollowupsQuerySchema.parse(query)));
    }
    return json(await findPhoneFollowup(query));
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
