import { requireAdmin } from "../../../../server/auth";
import { errorResponse, json } from "../../../../server/http";
import { adminUserQuerySchema, deleteAdminUser, listAdminUsers, updateAdminUser } from "../../../../server/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const query = adminUserQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(await listAdminUsers(query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    return json(await updateAdminUser(await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");
    await deleteAdminUser(id ?? "");
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
