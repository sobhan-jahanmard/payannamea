import { requireAdmin } from "../../../../server/auth";
import {
  consultationLeadQuerySchema,
  listConsultationLeads,
  updateConsultationLeadStatus
} from "../../../../server/leads";
import { errorResponse, json } from "../../../../server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const query = consultationLeadQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(await listConsultationLeads(query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    return json(await updateConsultationLeadStatus(await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
