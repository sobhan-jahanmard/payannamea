import { randomUUID } from "node:crypto";

import { getDataSource } from "./db/data-source";
import { AiReviewEntity, AiReviewSchema, FinalOutputSchema, OrderFileSchema, OrderSchema } from "./db/entities";
import { readStoredUpload } from "./files";
import { ApiError } from "./http";
import { getOrderOr404 } from "./orders";
import { isPresentationOrder } from "../lib/presentation";

const active = ["queued", "running"] as const;
const mainOutput = <T extends { id: string; output_type: string }>(order: { order_type: string | null }, outputs: T[]): T | undefined =>
  isPresentationOrder(order)
    ? outputs.find(file => file.output_type === "pptx") ?? outputs.find(file => file.output_type === "sample")
    : outputs.find(file => file.output_type === "docx") ?? outputs.find(file => file.output_type === "pdf");

export function serializeAiReview(job: AiReviewEntity) {
  return {
    id: job.id, order_id: job.order_id, action: job.action, status: job.status,
    parent_review_id: job.parent_review_id, score: job.score == null ? null : Number(job.score),
    report: job.report, fix_prompt: job.fix_prompt, requested_prompt: job.requested_prompt,
    applied_files: job.applied_files, restart_step: job.restart_step, error: job.error,
    created_at: job.created_at.toISOString(), started_at: job.started_at?.toISOString() ?? null,
    finished_at: job.finished_at?.toISOString() ?? null
  };
}

export async function listAiReviews(orderId: string) {
  await getOrderOr404(orderId);
  const db = await getDataSource();
  const jobs = await db.getRepository(AiReviewSchema).find({ where: { order_id: orderId },
    order: { created_at: "DESC" } });
  return jobs.map(serializeAiReview);
}

export async function queueAiReview(orderId: string) {
  const db = await getDataSource();
  const id = await db.transaction(async manager => {
    const order = await manager.getRepository(OrderSchema).createQueryBuilder("o")
      .where("o.id = :orderId", { orderId }).setLock("pessimistic_write").getOne();
    if (!order) throw new ApiError(404, "Order not found");
    const existing = await manager.getRepository(AiReviewSchema).findOne({
      where: active.map(status => ({ order_id: orderId, status }))
    });
    if (existing) throw new ApiError(409, "بازبینی یا اصلاح قبلی این سفارش هنوز در جریان است.");
    const files = await manager.getRepository(OrderFileSchema).find({ where: { order_id: orderId }, order: { created_at: "ASC" } });
    if (!files.length) throw new ApiError(422, "فایل‌های ورودی سفارش موجود نیستند.");
    const outputs = await manager.getRepository(FinalOutputSchema).find({ where: { order_id: orderId }, order: { created_at: "DESC" } });
    const main = mainOutput(order, outputs);
    if (!main) throw new ApiError(422, "برای بازبینی ابتدا خروجی اصلی سفارش باید موجود باشد.");
    const pairType = main.output_type === "pptx" ? "pdf" : main.output_type === "sample" ? "sample_pdf" : main.output_type === "docx" ? "pdf" : null;
    const pair = outputs.find(file => file.output_type === pairType &&
      file.worker_submission_id === main.worker_submission_id);
    const job = manager.getRepository(AiReviewSchema).create({
      id: randomUUID(), order_id: orderId, action: "review", status: "queued", parent_review_id: null,
      input_file_ids: files.map(file => file.id), output_file_ids: [main.id, ...(pair ? [pair.id] : [])],
      requested_prompt: null, score: null, report: null, fix_prompt: null, applied_files: [],
      restart_step: null, error: null, worker_id: null, started_at: null, finished_at: null
    });
    await manager.getRepository(AiReviewSchema).save(job);
    return job.id;
  });
  return serializeAiReview((await db.getRepository(AiReviewSchema).findOneBy({ id }))!);
}

export async function queueAiFix(orderId: string, reviewId: string, prompt: string) {
  const guidance = prompt.trim();
  if (guidance.length < 20 || guidance.length > 20_000) throw new ApiError(422, "متن اصلاح باید بین ۲۰ تا ۲۰٬۰۰۰ نویسه باشد.");
  const db = await getDataSource();
  const id = await db.transaction(async manager => {
    const order = await manager.getRepository(OrderSchema).createQueryBuilder("o")
      .where("o.id = :orderId", { orderId }).setLock("pessimistic_write").getOne();
    if (!order) throw new ApiError(404, "Order not found");
    const review = await manager.getRepository(AiReviewSchema).findOneBy({ id: reviewId, order_id: orderId });
    if (!review || review.action !== "review" || review.status !== "completed") throw new ApiError(409, "بازبینی کامل‌شده‌ای برای اصلاح پیدا نشد.");
    if (await manager.getRepository(AiReviewSchema).findOne({ where: active.map(status => ({ order_id: orderId, status })) }))
      throw new ApiError(409, "بازبینی یا اصلاح قبلی این سفارش هنوز در جریان است.");
    const latest = await manager.getRepository(FinalOutputSchema).find({ where: { order_id: orderId }, order: { created_at: "DESC" } });
    const currentMain = mainOutput(order, latest);
    if (!currentMain || currentMain.id !== review.output_file_ids[0])
      throw new ApiError(409, "خروجی از زمان بازبینی تغییر کرده است؛ ابتدا نسخهٔ جدید را بازبینی کنید.");
    const job = manager.getRepository(AiReviewSchema).create({
      id: randomUUID(), order_id: orderId, action: "fix", status: "queued", parent_review_id: review.id,
      input_file_ids: review.input_file_ids, output_file_ids: review.output_file_ids,
      requested_prompt: guidance, score: null, report: null, fix_prompt: null, applied_files: [],
      restart_step: null, error: null, worker_id: null, started_at: null, finished_at: null
    });
    await manager.getRepository(AiReviewSchema).save(job);
    return job.id;
  });
  return serializeAiReview((await db.getRepository(AiReviewSchema).findOneBy({ id }))!);
}

export async function claimAiReview(workerId: string) {
  const db = await getDataSource();
  const id = await db.transaction(async manager => {
    await manager.getRepository(AiReviewSchema).createQueryBuilder().update()
      .set({ status: "failed", error: "Worker Plus stopped before completing this job; request a new review or fix.", finished_at: new Date() })
      .where("status = 'running' and started_at < :stale", { stale: new Date(Date.now() - 6 * 60 * 60 * 1000) })
      .execute();
    const job = await manager.getRepository(AiReviewSchema).createQueryBuilder("job")
      .where("job.status = 'queued'").orderBy("job.created_at", "ASC")
      .setLock("pessimistic_write").setOnLocked("skip_locked").getOne();
    if (!job) return null;
    job.status = "running";
    job.worker_id = workerId;
    job.started_at = new Date();
    await manager.getRepository(AiReviewSchema).save(job);
    return job.id;
  });
  return id ? { id } : null;
}

export async function getAiReviewForWorker(jobId: string, workerId: string) {
  const db = await getDataSource();
  const job = await db.getRepository(AiReviewSchema).findOneBy({ id: jobId, worker_id: workerId, status: "running" });
  if (!job) throw new ApiError(404, "Active review job not found");
  const order = await getOrderOr404(job.order_id);
  const files = (order.files ?? []).filter(file => job.input_file_ids.includes(file.id));
  const outputs = (order.final_outputs ?? []).filter(file => job.output_file_ids.includes(file.id));
  if (files.length !== job.input_file_ids.length || outputs.length !== job.output_file_ids.length)
    throw new ApiError(409, "Review inputs changed after this job was queued");
  return { ...serializeAiReview(job), order: {
      id: order.id, title: order.title, order_type: order.order_type, degree: order.degree,
      university: order.university, methodology: order.methodology, language: order.language,
      field_of_study: order.field_of_study, quantity_value: order.quantity_value,
      requires_charts: order.requires_charts, presentation_style: order.presentation_style,
      notes: order.notes, abstract: order.abstract, files: files.map(file => ({ id: file.id }))
    },
    files: [...files.map(file => ({ id: file.id, name: file.original_name, type: file.file_type })),
            ...outputs.map(file => ({ id: file.id, name: file.original_name, type: file.output_type }))],
    parent: job.parent_review_id ? serializeAiReview((await db.getRepository(AiReviewSchema).findOneBy({ id: job.parent_review_id }))!) : null };
}

export async function readAiReviewFile(jobId: string, workerId: string, fileId: string) {
  const db = await getDataSource();
  const job = await db.getRepository(AiReviewSchema).findOneBy({ id: jobId, worker_id: workerId, status: "running" });
  if (!job || ![...job.input_file_ids, ...job.output_file_ids].includes(fileId)) throw new ApiError(403, "File is outside this review job");
  const input = await db.getRepository(OrderFileSchema).findOneBy({ id: fileId, order_id: job.order_id });
  const output = input ? null : await db.getRepository(FinalOutputSchema).findOneBy({ id: fileId, order_id: job.order_id });
  const file = input ?? output;
  if (!file) throw new ApiError(404, "Review file not found");
  const stored = await readStoredUpload(file.storage_path);
  if (!stored) throw new ApiError(404, "Stored file not found");
  return { ...stored, name: file.original_name };
}

export async function completeAiReview(jobId: string, workerId: string, result: {
  status: "completed" | "failed"; score?: number; report?: string; fix_prompt?: string;
  applied_files?: string[]; restart_step?: number; error?: string;
}) {
  const db = await getDataSource();
  const job = await db.getRepository(AiReviewSchema).findOneBy({ id: jobId, worker_id: workerId, status: "running" });
  if (!job) throw new ApiError(409, "Review job is not active for this worker");
  if (result.status === "completed" && job.action === "review" &&
      (!(typeof result.score === "number" && Number.isFinite(result.score) && result.score >= 0 && result.score <= 20) || !result.report?.trim() || !result.fix_prompt?.trim()))
    throw new ApiError(422, "Review completion needs a score, report and repair prompt");
  if (result.status === "completed" && job.action === "fix" &&
      (!result.applied_files?.length || result.restart_step !== 7))
    throw new ApiError(422, "A fix must apply tested algorithm changes and resume from stage 7");
  job.status = result.status;
  job.score = job.action === "review" && result.status === "completed" ? result.score! : null;
  job.report = result.report?.trim().slice(0, 40_000) || null;
  job.fix_prompt = job.action === "review" && result.status === "completed" ? result.fix_prompt!.trim().slice(0, 20_000) : null;
  job.applied_files = result.applied_files ?? [];
  job.restart_step = result.restart_step ?? null;
  job.error = result.error?.trim().slice(0, 4_000) || null;
  job.finished_at = new Date();
  await db.getRepository(AiReviewSchema).save(job);
  return serializeAiReview(job);
}
