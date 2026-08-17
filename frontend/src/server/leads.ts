import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getDataSource } from "./db/data-source";
import {
  ConsultationLeadSchema,
  type ConsultationLeadStatus
} from "./db/entities";
import { email } from "./email";
import { ApiError } from "./http";
import { normalizeIranianPhone } from "./otp";

export const consultationLeadCreateSchema = z.object({
  phone: z.string().min(1).max(40),
  source: z.literal("landing_page").default("landing_page")
});

export const consultationLeadQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(["new", "contacted", "closed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50)
});

export const consultationLeadUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "closed"]).optional(),
  admin_note: z.string().trim().max(2_000).optional()
}).refine((input) => input.status !== undefined || input.admin_note !== undefined, {
  message: "Status or admin note is required"
});

export async function createConsultationLead(rawInput: unknown) {
  const input = consultationLeadCreateSchema.parse(rawInput);
  const phone = normalizeIranianPhone(input.phone);
  const dataSource = await getDataSource();

  const result = await dataSource.transaction(async (manager) => {
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [`consultation:${phone}`]);
    const repo = manager.getRepository(ConsultationLeadSchema);
    const existing = await repo.findOneBy({ phone });
    const now = new Date();
    if (existing) {
      const recentlyRequested = now.getTime() - existing.last_requested_at.getTime() < 5 * 60 * 1_000;
      if (!recentlyRequested) {
        existing.request_count += 1;
        existing.last_requested_at = now;
        existing.status = "new";
        await repo.save(existing);
      }
      return { lead: existing, repeated: true, notify: !recentlyRequested };
    }

    const lead = await repo.save({
      id: randomUUID(),
      phone,
      source: input.source,
      status: "new",
      request_count: 1,
      last_requested_at: now
    });
    return { lead, repeated: false, notify: true };
  });

  if (result.notify) {
    await email.sendConsultationLead(phone, result.repeated);
  }
  return result.lead;
}

export async function listConsultationLeads(rawQuery: unknown) {
  const query = consultationLeadQuerySchema.parse(rawQuery);
  const dataSource = await getDataSource();
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (query.status) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${query.search}%`);
    conditions.push(`(phone ilike $${values.length} or admin_note ilike $${values.length})`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const offset = (query.page - 1) * query.limit;

  const [leads, countRows, statusRows] = await Promise.all([
    dataSource.query(
      `select id, phone, source, status, admin_note, request_count, last_requested_at, created_at, updated_at
       from consultation_leads ${where}
       order by last_requested_at desc limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.limit, offset]
    ),
    dataSource.query(`select count(*)::int as count from consultation_leads ${where}`, values),
    dataSource.query(
      `select status, count(*)::int as count from consultation_leads group by status order by status`
    )
  ]);
  const total = countRows[0]?.count ?? 0;
  return {
    leads,
    counts: Object.fromEntries(statusRows.map((row: { status: string; count: number }) => [row.status, row.count])),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit))
    }
  };
}

export async function updateConsultationLead(rawInput: unknown) {
  const input = consultationLeadUpdateSchema.parse(rawInput);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(ConsultationLeadSchema);
  const lead = await repo.findOneBy({ id: input.id });
  if (!lead) throw new ApiError(404, "Consultation lead not found");
  if (input.status !== undefined) {
    lead.status = input.status as ConsultationLeadStatus;
  }
  if (input.admin_note !== undefined) {
    lead.admin_note = input.admin_note;
  }
  return repo.save(lead);
}
