import { randomUUID } from "node:crypto";

import { EntityManager, MoreThanOrEqual } from "typeorm";
import { z } from "zod";

import { workerLockMinutes } from "./config";
import { getDataSource } from "./db/data-source";
import {
  FinalOutputSchema,
  OrderEntity,
  OrderSchema,
  WorkerLockEntity,
  WorkerLockSchema,
  WorkerSubmissionSchema
} from "./db/entities";
import { deleteStoredUpload } from "./files";
import { ApiError, compact } from "./http";
import { deleteWorkerLock, getOrderOr404, serializeOrder, setOrderStatus } from "./orders";

export const workerActionSchema = z.object({
  workerId: z.string().min(1).max(255),
  notes: z.string().optional().nullable()
});

const baseFinalOutputTypes = [
  "deliverable_source",
  "docx",
  "compliance_report",
  "reference_usage_report",
  "human_review_checklist",
  "final_readme"
] as const;

const outputTypeLabels: Record<string, string> = {
  deliverable_source: "deliverable source",
  docx: "editable Word file",
  pptx: "editable PowerPoint file",
  compliance_report: "compliance report",
  reference_usage_report: "reference usage report",
  human_review_checklist: "human review checklist",
  final_readme: "final README",
  image_sources: "figure source metadata"
};

export function utcNow(): Date {
  return new Date();
}

function lockExpiry(): Date {
  return new Date(Date.now() + workerLockMinutes() * 60 * 1000);
}

export async function cleanExpiredLocks(manager: EntityManager): Promise<void> {
  const lockRepo = manager.getRepository(WorkerLockSchema);
  const expiredLocks = await lockRepo
    .createQueryBuilder("lock")
    .leftJoinAndSelect("lock.order", "order")
    .where("lock.lock_expires_at < :now", { now: utcNow() })
    .getMany();

  for (const lock of expiredLocks) {
    const order = lock.order;
    if (order && order.status === "in_progress") {
      await setOrderStatus(manager, order, "approved", "system", "مهلت قفل پردازشگر تمام شد و سفارش دوباره آماده انجام است.");
    }
    await lockRepo.delete({ id: lock.id });
  }
}

export async function getActiveLock(
  manager: EntityManager,
  orderId: string,
  workerId: string
): Promise<WorkerLockEntity> {
  const lock = await manager.getRepository(WorkerLockSchema).findOneBy({
    order_id: orderId,
    worker_id: workerId,
    lock_expires_at: MoreThanOrEqual(utcNow())
  });
  if (!lock) {
    throw new ApiError(409, "Order is not locked by this active worker");
  }
  return lock;
}

export async function extendLock(manager: EntityManager, lock: WorkerLockEntity): Promise<void> {
  lock.heartbeat_at = utcNow();
  lock.lock_expires_at = lockExpiry();
  await manager.getRepository(WorkerLockSchema).save(lock);
}

export async function claimOldest(workerId: string) {
  const dataSource = await getDataSource();
  let claimedId: string | null = null;

  await dataSource.transaction(async (manager) => {
    await cleanExpiredLocks(manager);
    const order = await manager
      .getRepository(OrderSchema)
      .createQueryBuilder("order")
      .where("order.status in (:...statuses)", { statuses: ["approved", "failed"] })
      .orderBy("order.created_at", "ASC")
      .setLock("pessimistic_write")
      .setOnLocked("skip_locked")
      .getOne();

    if (!order) {
      throw new ApiError(404, "No approved or failed orders");
    }

    const now = utcNow();
    await setOrderStatus(manager, order, "in_progress", workerId, "پردازشگر سفارش را برای انجام برداشت.");
    await manager.getRepository(WorkerLockSchema).save({
      id: randomUUID(),
      order_id: order.id,
      worker_id: workerId,
      locked_at: now,
      heartbeat_at: now,
      lock_expires_at: lockExpiry()
    });
    claimedId = order.id;
  });

  const order = await getOrderOr404(claimedId!);
  const detail = serializeOrder(order) as ReturnType<typeof serializeOrder> & {
    files: unknown[];
    references: unknown[];
  };
  return {
    orderId: order.id,
    status: order.status,
    customerInput: detail,
    files: detail.files,
    references: detail.references,
    createdAt: order.created_at.toISOString()
  };
}

export async function claimById(workerId: string, orderId: string, options: { redo?: boolean } = {}) {
  const allowedStatuses = options.redo
    ? ["approved", "failed", "in_progress", "worker_done_pending_approval", "admin_review"]
    : ["approved", "failed"];
  const dataSource = await getDataSource();
  let claimedId: string | null = null;

  await dataSource.transaction(async (manager) => {
    await cleanExpiredLocks(manager);
    const order = await manager
      .getRepository(OrderSchema)
      .createQueryBuilder("order")
      .where("order.id = :orderId", { orderId })
      .setLock("pessimistic_write")
      .getOne();

    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    if (!allowedStatuses.includes(order.status)) {
      throw new ApiError(
        409,
        `Order with status '${order.status}' cannot be claimed${options.redo ? " for redo" : ""}`
      );
    }

    const now = utcNow();
    await deleteWorkerLock(manager, order.id);
    await setOrderStatus(
      manager,
      order,
      "in_progress",
      workerId,
      options.redo ? "پردازشگر سفارش مشخص‌شده را برای انجام دوباره برداشت." : "پردازشگر سفارش مشخص‌شده را برای انجام برداشت."
    );
    await manager.getRepository(WorkerLockSchema).save({
      id: randomUUID(),
      order_id: order.id,
      worker_id: workerId,
      locked_at: now,
      heartbeat_at: now,
      lock_expires_at: lockExpiry()
    });
    claimedId = order.id;
  });

  const order = await getOrderOr404(claimedId!);
  const detail = serializeOrder(order) as ReturnType<typeof serializeOrder> & {
    files: unknown[];
    references: unknown[];
  };
  return {
    orderId: order.id,
    status: order.status,
    customerInput: detail,
    files: detail.files,
    references: detail.references,
    createdAt: order.created_at.toISOString()
  };
}

export async function startOrHeartbeat(
  orderId: string,
  workerId: string,
  notes: string | null | undefined,
  status?: "in_progress"
): Promise<OrderEntity> {
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    const lock = await getActiveLock(manager, order.id, workerId);
    await extendLock(manager, lock);
    if (status) {
      await setOrderStatus(manager, order, status, workerId, notes);
    }
  });
  return getOrderOr404(orderId);
}

export async function submitDraft(
  orderId: string,
  workerId: string,
  notes: string | null,
  storedDraft?: {
    original_name: string;
    stored_name: string;
    storage_path: string;
    content_type: string | null;
    size_bytes: number;
  }
): Promise<OrderEntity> {
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    const lock = await getActiveLock(manager, order.id, workerId);
    await extendLock(manager, lock);
    const submission = await manager.getRepository(WorkerSubmissionSchema).save({
      id: randomUUID(),
      order_id: order.id,
      worker_id: workerId,
      submission_type: "draft",
      notes: compact(notes)
    });

    if (storedDraft) {
      await manager.getRepository(FinalOutputSchema).save({
        id: randomUUID(),
        order_id: order.id,
        worker_submission_id: submission.id,
        output_type: "draft",
        original_name: storedDraft.original_name,
        stored_name: storedDraft.stored_name,
        storage_path: storedDraft.storage_path,
        content_type: storedDraft.content_type,
        size_bytes: storedDraft.size_bytes,
        notes: compact(notes)
      });
    }

    await setOrderStatus(manager, order, "in_progress", workerId, notes || "Draft submitted for human review.");
  });
  return getOrderOr404(orderId);
}

function isPresentationOrder(order: Pick<OrderEntity, "order_type" | "quantity_type">): boolean {
  const orderType = compact(order.order_type) ?? "";
  return order.quantity_type === "slides" || orderType.includes("پاورپوینت") || orderType.includes("ارائه");
}

function requestedOrDefaultImageCount(
  order: Pick<OrderEntity, "image_count" | "quantity_type" | "quantity_value" | "order_type">
): number {
  if (typeof order.image_count === "number") {
    return Math.max(Math.trunc(order.image_count), 0);
  }

  const quantityValue = typeof order.quantity_value === "number" ? Math.trunc(order.quantity_value) : 0;
  const orderType = compact(order.order_type) ?? "";
  if (order.quantity_type === "slides" && quantityValue > 0) {
    return Math.min(Math.max(Math.ceil(quantityValue / 4), 1), 6);
  }
  if (order.quantity_type === "pages" && quantityValue > 0) {
    return Math.min(Math.max(Math.ceil(quantityValue / 3), 1), 4);
  }
  if (order.quantity_type === "words" && quantityValue > 0) {
    return Math.min(Math.max(Math.ceil(quantityValue / 1200), 1), 4);
  }
  if (orderType.includes("پایان") || orderType.includes("رساله") || orderType.includes("پروپوزال")) {
    return 3;
  }
  return 1;
}

function requiredImageSourceCount(order: OrderEntity): number {
  const expectedCount = requestedOrDefaultImageCount(order);
  if (isPresentationOrder(order)) {
    return Math.max(expectedCount, 1);
  }
  return expectedCount;
}

function requiredFinalOutputTypes(order: OrderEntity): string[] {
  const required = new Set<string>(baseFinalOutputTypes);
  if (isPresentationOrder(order)) {
    required.add("pptx");
  }
  if (requiredImageSourceCount(order) > 0) {
    required.add("image_sources");
  }
  return [...required];
}

function validateFinalUploadMatrix(
  order: OrderEntity,
  outputTypes: Iterable<string>
): void {
  const present = new Set(outputTypes);
  const missing = requiredFinalOutputTypes(order).filter((outputType) => !present.has(outputType));
  if (missing.length) {
    throw new ApiError(
      422,
      `Final review package is incomplete. Missing: ${missing.map((outputType) => outputTypeLabels[outputType] ?? outputType).join(", ")}`
    );
  }
}

async function finalOutputTypesAfterUpload(
  manager: EntityManager,
  orderId: string,
  uploads: Array<{ output_type: string; size_bytes: number }>,
  options: { replaceExisting?: boolean }
): Promise<string[]> {
  const replacedTypes = new Set(uploads.map((upload) => upload.output_type));
  const uploadTypes = new Set(uploads.filter((upload) => upload.size_bytes > 0).map((upload) => upload.output_type));
  if (!options.replaceExisting) {
    return [...uploadTypes];
  }

  const existingOutputs = await manager
    .getRepository(FinalOutputSchema)
    .createQueryBuilder("output")
    .select("output.output_type", "output_type")
    .where("output.order_id = :orderId", { orderId })
    .getRawMany<{ output_type: string }>();

  const retainedExistingTypes = existingOutputs
    .map((output) => output.output_type)
    .filter((outputType) => !replacedTypes.has(outputType));
  return [...new Set([...retainedExistingTypes, ...uploadTypes])];
}

export async function submitFinal(
  orderId: string,
  workerId: string,
  notes: string | null,
  uploads: Array<{
    output_type: string;
    original_name: string;
    stored_name: string;
    storage_path: string;
    content_type: string | null;
    size_bytes: number;
  }>,
  options: { replaceExisting?: boolean } = {}
): Promise<OrderEntity> {
  if (uploads.length === 0) {
    throw new ApiError(422, "At least one final output file is required");
  }

  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    let lock = null;
    try {
      lock = await getActiveLock(manager, order.id, workerId);
      await extendLock(manager, lock);
    } catch (error) {
      const canReplaceReviewedPackage =
        options.replaceExisting === true &&
        ["worker_done_pending_approval", "admin_review"].includes(order.status);
      if (!canReplaceReviewedPackage) {
        throw error;
      }
    }

    validateFinalUploadMatrix(order, await finalOutputTypesAfterUpload(manager, order.id, uploads, options));

    const submission = await manager.getRepository(WorkerSubmissionSchema).save({
      id: randomUUID(),
      order_id: order.id,
      worker_id: workerId,
      submission_type: "final",
      notes: compact(notes)
    });

    if (options.replaceExisting) {
      const outputTypes = [...new Set(uploads.map((upload) => upload.output_type))];
      const existingOutputs = await manager
        .getRepository(FinalOutputSchema)
        .createQueryBuilder("output")
        .where("output.order_id = :orderId", { orderId: order.id })
        .andWhere("output.output_type in (:...outputTypes)", { outputTypes })
        .getMany();

      if (existingOutputs.length) {
        const existingStoragePaths = existingOutputs.map((output) => ({
          id: output.id,
          storage_path: output.storage_path
        }));
        await manager
          .getRepository(FinalOutputSchema)
          .createQueryBuilder()
          .delete()
          .where("order_id = :orderId", { orderId: order.id })
          .andWhere("output_type in (:...outputTypes)", { outputTypes })
          .execute();
        for (const output of existingStoragePaths) {
          try {
            await deleteStoredUpload(output.storage_path);
          } catch (error) {
            console.warn("Could not delete replaced final output from storage", {
              orderId: order.id,
              outputId: output.id,
              storagePath: output.storage_path,
              error
            });
          }
        }
      }
    }

    for (const upload of uploads) {
      await manager.getRepository(FinalOutputSchema).save({
        id: randomUUID(),
        order_id: order.id,
        worker_submission_id: submission.id,
        output_type: upload.output_type,
        original_name: upload.original_name,
        stored_name: upload.stored_name,
        storage_path: upload.storage_path,
        content_type: upload.content_type,
        size_bytes: upload.size_bytes,
        notes: compact(notes)
      });
    }

    if (order.status !== "admin_review") {
      await setOrderStatus(manager, order, "worker_done_pending_approval", workerId, notes || "Worker completed the review package; awaiting admin approval.");
    }
    if (lock) {
      await deleteWorkerLock(manager, order.id);
    }
  });
  return getOrderOr404(orderId);
}

export async function getReviewedOrderForWorker(orderId: string) {
  const order = await getOrderOr404(orderId);
  if (!["worker_done_pending_approval", "admin_review"].includes(order.status)) {
    throw new ApiError(409, `Order with status '${order.status}' is not ready for admin-note review`);
  }
  return serializeOrder(order, true, "admin");
}

export async function failOrder(orderId: string, workerId: string, notes: string | null): Promise<OrderEntity> {
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    const lock = await getActiveLock(manager, order.id, workerId);
    await setOrderStatus(manager, order, "failed", workerId, notes);
    await manager.getRepository(WorkerLockSchema).delete({ id: lock.id });
  });
  return getOrderOr404(orderId);
}

export async function resetOrder(orderId: string, workerId: string, notes: string | null): Promise<OrderEntity> {
  const resettable = ["in_progress", "worker_done_pending_approval", "admin_review", "failed"];
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    if (!resettable.includes(order.status)) {
      throw new ApiError(409, `Order with status '${order.status}' cannot be reset for worker pickup`);
    }
    await deleteWorkerLock(manager, order.id);
    await setOrderStatus(manager, order, "approved", workerId, notes || "سفارش دوباره برای انجام آماده شد.");
  });
  return getOrderOr404(orderId);
}
