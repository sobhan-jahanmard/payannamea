import { randomUUID } from "node:crypto";

import { EntityManager } from "typeorm";
import { z } from "zod";

import { getDataSource } from "./db/data-source";
import {
  FinalOutputEntity,
  FinalOutputSchema,
  ORDER_STATUSES,
  PAYMENT_NOTE_TYPES,
  PAYMENT_STATUSES,
  OrderEntity,
  OrderFileEntity,
  OrderFileSchema,
  OrderReferenceEntity,
  OrderReferenceSchema,
  OrderSchema,
  OrderStatus,
  OrderStatusLogEntity,
  OrderStatusLogSchema,
  PaymentNoteEntity,
  PaymentNoteSchema,
  PaymentNoteType,
  PaymentStatus,
  ReviewNoteEntity,
  ReviewNoteSchema,
  UserEntity,
  WorkerLockSchema
} from "./db/entities";
import { ApiError, compact } from "./http";
import { deleteStoredUpload } from "./files";
import { email } from "./email";
import {
  academicDetailLabels,
  orderTypeFieldConfig,
  orderTypeOptions,
  quantityTypeOptions,
  citationStyleNotRequiredValue,
  type AcademicDetailKey,
  type QuantityType
} from "../lib/order-options";

export const referenceSchema = z.object({
  reference_type: z.string().min(1).max(80),
  title: z.string().min(1).max(500),
  authors: z.string().max(500).optional().nullable(),
  year: z.string().max(20).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  notes: z.string().optional().nullable(),
  required_usage: z.boolean().default(true)
});

const optionalQuantity = z.number().int().min(1).max(500000).optional().nullable();
const optionalImageCount = z.number().int().min(0).max(1000).optional().nullable();
const academicDetailFields = {
  faculty: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  advisor_name: z.string().max(255).optional().nullable(),
  consultant_name: z.string().max(255).optional().nullable(),
  instructor_name: z.string().max(255).optional().nullable(),
  course_name: z.string().max(255).optional().nullable(),
  title_english: z.string().max(500).optional().nullable(),
  keywords: z.string().max(500).optional().nullable(),
  abstract: z.string().optional().nullable()
} as const;

function orderFieldsRefinement(
  payload: { order_type: string; quantity_type?: string | null; quantity_value?: number | null; academic_style?: string | null } & Partial<Record<AcademicDetailKey, string | number | null | undefined>>,
  ctx: z.RefinementCtx
) {
  if (!orderTypeOptions.includes(payload.order_type)) {
    ctx.addIssue({
      code: "custom",
      path: ["order_type"],
      message: "نوع سفارش معتبر نیست"
    });
    return;
  }

  const fieldConfig = orderTypeFieldConfig(payload.order_type);
  const requiredFields = fieldConfig.required;
  for (const field of requiredFields) {
    const value = payload[field];
    const isMissing = typeof value === "number" ? value < 1 : !compact(value);
    if (isMissing) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${academicDetailLabels[field]} الزامی است`
      });
    }
  }

  const quantityType = (payload.quantity_type ?? fieldConfig.defaultQuantityType) as QuantityType;
  if (!quantityTypeOptions.includes(quantityType) || !fieldConfig.quantityTypes.includes(quantityType)) {
    ctx.addIssue({
      code: "custom",
      path: ["quantity_type"],
      message: "واحد حجم با نوع سفارش هم‌خوان نیست"
    });
  }

  if (fieldConfig.requiresCitationStyle && !compact(payload.academic_style)) {
    ctx.addIssue({
      code: "custom",
      path: ["academic_style"],
      message: "شیوه ارجاع برای این نوع سفارش الزامی است"
    });
  }
}

export const orderCreateSchema = z.object({
  correspondence_email: z.string().trim().email().max(255),
  degree: z.string().min(1).max(120),
  university: z.string().min(1).max(255),
  title: z.string().min(3).max(500),
  student_name: z.string().min(2).max(255),
  student_number: z.string().trim().min(1).max(80),
  order_type: z.string().min(1).max(120),
  methodology: z.string().min(1).max(160),
  language: z.string().min(1).max(80),
  academic_style: z.string().max(120).optional().nullable(),
  field_of_study: z.string().max(255).optional().nullable(),
  ...academicDetailFields,
  quantity_type: z.enum(quantityTypeOptions as [QuantityType, ...QuantityType[]]).optional().nullable(),
  quantity_value: optionalQuantity,
  image_count: optionalImageCount,
  requires_charts: z.boolean().default(false),
  deadline: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  moarref_code: z.string().max(120).optional().nullable(),
  references: z.array(referenceSchema).default([])
}).superRefine(orderFieldsRefinement);

export const orderUpdateSchema = orderCreateSchema;

export const statusPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().optional().nullable()
});

export const reviewNoteSchema = z.object({
  author: z.string().min(2).max(255),
  note: z.string().min(1)
});

export const paymentNoteSchema = z.object({
  note_type: z.enum(PAYMENT_NOTE_TYPES),
  payment_status: z.enum(PAYMENT_STATUSES),
  note: z.string().optional().nullable()
});

const detailRelations = {
  customer: true,
  files: true,
  references: true,
  status_logs: true,
  final_outputs: true,
  review_notes: true,
  worker_lock: true,
  payment_notes: true
} as const;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function byDate<T extends { created_at: Date }>(items: T[] | undefined): T[] {
  return [...(items ?? [])].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
}

function parseDeadline(value?: string | null): Date | null {
  const trimmed = compact(value);
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, "Deadline must be a valid UTC ISO date");
  }
  return date;
}

export function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    phone: user.phone,
    is_verified: user.is_verified,
    ...(user.role !== "customer" ? { full_name: user.full_name, email: user.email, username: user.username } : {}),
    role: user.role,
    created_at: iso(user.created_at)
  };
}

export function serializeOrderFile(file: OrderFileEntity) {
  return {
    id: file.id,
    order_id: file.order_id,
    file_type: file.file_type,
    original_name: file.original_name,
    stored_name: file.stored_name,
    storage_path: file.storage_path,
    content_type: file.content_type,
    size_bytes: Number(file.size_bytes),
    uploaded_by: file.uploaded_by,
    created_at: iso(file.created_at),
    url: `/uploads/${file.storage_path}`
  };
}

export function serializeReference(reference: OrderReferenceEntity) {
  return {
    id: reference.id,
    order_id: reference.order_id,
    reference_type: reference.reference_type,
    title: reference.title,
    authors: reference.authors,
    year: reference.year,
    url: reference.url,
    notes: reference.notes,
    required_usage: reference.required_usage,
    created_at: iso(reference.created_at)
  };
}

function serializeStatusLog(log: OrderStatusLogEntity) {
  return {
    id: log.id,
    order_id: log.order_id,
    from_status: log.from_status,
    to_status: log.to_status,
    actor: log.actor,
    notes: log.notes,
    created_at: iso(log.created_at)
  };
}

export function serializeFinalOutput(output: FinalOutputEntity) {
  return {
    id: output.id,
    order_id: output.order_id,
    worker_submission_id: output.worker_submission_id,
    output_type: output.output_type,
    original_name: output.original_name,
    stored_name: output.stored_name,
    storage_path: output.storage_path,
    content_type: output.content_type,
    size_bytes: Number(output.size_bytes),
    notes: output.notes,
    created_at: iso(output.created_at),
    url: `/api/orders/${output.order_id}/downloads/${output.id}`
  };
}

const CUSTOMER_OUTPUT_PRIORITY = ["pptx", "docx", "pdf", "deliverable_source"];

export function customerVisibleFinalOutputs(outputs: FinalOutputEntity[] | undefined): FinalOutputEntity[] {
  if (!outputs?.length) {
    return [];
  }
  const selected = [...outputs].sort((left, right) => {
    const leftPriority = CUSTOMER_OUTPUT_PRIORITY.indexOf(left.output_type);
    const rightPriority = CUSTOMER_OUTPUT_PRIORITY.indexOf(right.output_type);
    const normalizedLeft = leftPriority === -1 ? CUSTOMER_OUTPUT_PRIORITY.length : leftPriority;
    const normalizedRight = rightPriority === -1 ? CUSTOMER_OUTPUT_PRIORITY.length : rightPriority;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return right.created_at.getTime() - left.created_at.getTime();
  })[0];
  return selected ? [selected] : [];
}

export function customerOutputFileName(orderId: string, output: FinalOutputEntity): string {
  const extensionByType: Record<string, string> = {
    pptx: "pptx",
    docx: "docx",
    pdf: "pdf",
    deliverable_source: "md"
  };
  const extension = extensionByType[output.output_type] || pathExtension(output.original_name) || "dat";
  return `order_${orderId}.${extension}`;
}

function pathExtension(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.trim();
  return extension && extension !== fileName ? extension : null;
}

function serializeCustomerFinalOutput(output: FinalOutputEntity) {
  return {
    ...serializeFinalOutput(output),
    original_name: customerOutputFileName(output.order_id, output),
    stored_name: customerOutputFileName(output.order_id, output)
  };
}

function serializeReviewNote(note: ReviewNoteEntity) {
  return {
    id: note.id,
    order_id: note.order_id,
    author: note.author,
    note: note.note,
    created_at: iso(note.created_at)
  };
}

function serializePaymentNote(note: PaymentNoteEntity) {
  return {
    id: note.id,
    order_id: note.order_id,
    note_type: note.note_type,
    payment_status: note.payment_status,
    note: note.note,
    original_name: note.original_name,
    stored_name: note.stored_name,
    storage_path: note.storage_path,
    content_type: note.content_type,
    size_bytes: note.size_bytes === null ? null : Number(note.size_bytes),
    created_at: iso(note.created_at),
    url: note.storage_path ? `/uploads/${note.storage_path}` : null
  };
}

export function serializeOrder(order: OrderEntity, detail = true, audience: "admin" | "customer" = "admin") {
  if (!order.customer) {
    throw new ApiError(500, "Order customer relation was not loaded");
  }

  const base = {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    moarref_payment_status: order.moarref_payment_status,
    correspondence_email: order.correspondence_email,
    degree: order.degree,
    university: order.university,
    title: order.title,
    student_name: order.student_name,
    student_number: order.student_number,
    order_type: order.order_type,
    methodology: order.methodology,
    language: order.language,
    academic_style: order.academic_style,
    field_of_study: order.field_of_study,
    faculty: order.faculty,
    department: order.department,
    advisor_name: order.advisor_name,
    consultant_name: order.consultant_name,
    instructor_name: order.instructor_name,
    course_name: order.course_name,
    title_english: order.title_english,
    keywords: order.keywords,
    abstract: order.abstract,
    quantity_type: order.quantity_type,
    quantity_value: order.quantity_value,
    image_count: order.image_count,
    requires_charts: order.requires_charts,
    deadline: iso(order.deadline),
    notes: order.notes,
    moarref_code: order.moarref_code,
    created_at: iso(order.created_at),
    updated_at: iso(order.updated_at),
    customer: serializeUser(order.customer)
  };

  if (!detail) {
    return base;
  }

  return {
    ...base,
    files: byDate(order.files).map(serializeOrderFile),
    references: byDate(order.references).map(serializeReference),
    status_logs: audience === "admin" ? byDate(order.status_logs).map(serializeStatusLog) : [],
    final_outputs:
      audience === "customer"
        ? order.status === "completed"
          ? customerVisibleFinalOutputs(order.final_outputs).map(serializeCustomerFinalOutput)
          : []
        : byDate(order.final_outputs).map(serializeFinalOutput),
    review_notes: audience === "admin" ? byDate(order.review_notes).map(serializeReviewNote) : [],
    payment_notes: audience === "admin" ? byDate(order.payment_notes).map(serializePaymentNote) : []
  };
}

export async function getOrderOr404(orderId: string, manager?: EntityManager): Promise<OrderEntity> {
  const dataSource = manager ? null : await getDataSource();
  const repo = (manager ?? dataSource!.manager).getRepository(OrderSchema);
  const order = await repo.findOne({ where: { id: orderId }, relations: detailRelations });
  if (!order) {
    throw new ApiError(404, "Order not found");
  }
  return order;
}

export async function getOrderForUserOr404(orderId: string, user: UserEntity): Promise<OrderEntity> {
  const order = await getOrderOr404(orderId);
  if (user.role !== "admin" && order.user_id !== user.id) {
    throw new ApiError(404, "Order not found");
  }
  return order;
}

export async function setOrderStatus(
  manager: EntityManager,
  order: OrderEntity,
  toStatus: OrderStatus,
  actor: string,
  notes?: string | null
): Promise<void> {
  if (!ORDER_STATUSES.includes(toStatus)) {
    throw new ApiError(422, `Unknown order status '${toStatus}'`);
  }
  if (order.status === toStatus) {
    return;
  }

  const previous = order.status;
  order.status = toStatus;
  order.updated_at = new Date();
  await manager.getRepository(OrderSchema).update(
    { id: order.id },
    {
      status: toStatus,
      updated_at: order.updated_at
    }
  );
  await manager.getRepository(OrderStatusLogSchema).save({
    id: randomUUID(),
    order_id: order.id,
    from_status: previous,
    to_status: toStatus,
    actor,
    notes: compact(notes)
  });
}

export async function createCustomerOrder(user: UserEntity, rawPayload: unknown): Promise<OrderEntity> {
  const payload = orderCreateSchema.parse(rawPayload);
  const dataSource = await getDataSource();
  const orderId = randomUUID();

  await dataSource.transaction(async (manager) => {
    const order = manager.getRepository(OrderSchema).create({
      id: orderId,
      user_id: user.id,
      status: "submitted",
      payment_status: "not_paid",
      moarref_payment_status: "not_paid",
      correspondence_email: payload.correspondence_email.trim().toLowerCase(),
      degree: payload.degree,
      university: payload.university,
      title: payload.title.trim(),
      student_name: payload.student_name.trim(),
      student_number: payload.student_number.trim(),
      order_type: payload.order_type,
      methodology: payload.methodology,
      language: payload.language,
      academic_style: orderTypeFieldConfig(payload.order_type).requiresCitationStyle ? compact(payload.academic_style) ?? "APA 7" : citationStyleNotRequiredValue,
      field_of_study: compact(payload.field_of_study),
      faculty: compact(payload.faculty),
      department: compact(payload.department),
      advisor_name: compact(payload.advisor_name),
      consultant_name: compact(payload.consultant_name),
      instructor_name: compact(payload.instructor_name),
      course_name: compact(payload.course_name),
      title_english: compact(payload.title_english),
      keywords: compact(payload.keywords),
      abstract: compact(payload.abstract),
      quantity_type: payload.quantity_type ?? orderTypeFieldConfig(payload.order_type).defaultQuantityType,
      quantity_value: payload.quantity_value ?? null,
      image_count: payload.image_count ?? null,
      requires_charts: payload.requires_charts,
      deadline: parseDeadline(payload.deadline),
      notes: compact(payload.notes),
      moarref_code: compact(payload.moarref_code)
    });
    await manager.getRepository(OrderSchema).save(order);

    for (const reference of payload.references) {
      await manager.getRepository(OrderReferenceSchema).save({
        id: randomUUID(),
        order_id: orderId,
        reference_type: reference.reference_type,
        title: reference.title.trim(),
        authors: compact(reference.authors),
        year: compact(reference.year),
        url: compact(reference.url),
        notes: compact(reference.notes),
        required_usage: reference.required_usage
      });
    }

    await manager.getRepository(OrderStatusLogSchema).save({
      id: randomUUID(),
      order_id: order.id,
      from_status: null,
      to_status: "submitted",
      actor: "customer",
      notes: "سفارش ثبت شد و برای بررسی مدیر ارسال شد."
    });
  });

  const order = await getOrderOr404(orderId);
  await email.sendNewOrder(order);
  return order;
}

function assertCustomerEditable(order: OrderEntity): void {
  if (order.status !== "submitted") {
    throw new ApiError(409, "Only orders waiting for admin review can be edited");
  }
}

export async function updateCustomerOrder(order: OrderEntity, rawPayload: unknown): Promise<OrderEntity> {
  assertCustomerEditable(order);
  const payload = orderUpdateSchema.parse(rawPayload);
  if (payload.order_type !== order.order_type) {
    throw new ApiError(422, "Order type cannot be changed after the first step");
  }
  const dataSource = await getDataSource();

  await dataSource.transaction(async (manager) => {
    await manager.getRepository(OrderSchema).update(
      { id: order.id },
      {
        correspondence_email: payload.correspondence_email.trim().toLowerCase(),
        degree: payload.degree,
        university: payload.university,
        title: payload.title.trim(),
        student_name: payload.student_name.trim(),
        student_number: payload.student_number.trim(),
        methodology: payload.methodology,
        language: payload.language,
        academic_style: orderTypeFieldConfig(payload.order_type).requiresCitationStyle ? compact(payload.academic_style) ?? "APA 7" : citationStyleNotRequiredValue,
        field_of_study: compact(payload.field_of_study),
        faculty: compact(payload.faculty),
        department: compact(payload.department),
        advisor_name: compact(payload.advisor_name),
        consultant_name: compact(payload.consultant_name),
        instructor_name: compact(payload.instructor_name),
        course_name: compact(payload.course_name),
        title_english: compact(payload.title_english),
        keywords: compact(payload.keywords),
        abstract: compact(payload.abstract),
        quantity_type: payload.quantity_type ?? orderTypeFieldConfig(payload.order_type).defaultQuantityType,
        quantity_value: payload.quantity_value ?? null,
        image_count: payload.image_count ?? null,
        requires_charts: payload.requires_charts,
        deadline: parseDeadline(payload.deadline),
        notes: compact(payload.notes),
        moarref_code: compact(payload.moarref_code),
        updated_at: new Date()
      }
    );

    await manager.getRepository(OrderReferenceSchema).delete({ order_id: order.id });
    for (const reference of payload.references) {
      await manager.getRepository(OrderReferenceSchema).save({
        id: randomUUID(),
        order_id: order.id,
        reference_type: reference.reference_type,
        title: reference.title.trim(),
        authors: compact(reference.authors),
        year: compact(reference.year),
        url: compact(reference.url),
        notes: compact(reference.notes),
        required_usage: reference.required_usage
      });
    }
  });

  return getOrderOr404(order.id);
}

export async function listCustomerOrders(user: UserEntity): Promise<OrderEntity[]> {
  const dataSource = await getDataSource();
  return dataSource.getRepository(OrderSchema).find({
    where: { user_id: user.id },
    relations: { customer: true },
    order: { created_at: "DESC" }
  });
}

export async function listAdminOrders(statusFilter: string | null): Promise<OrderEntity[]> {
  const dataSource = await getDataSource();
  return dataSource.getRepository(OrderSchema).find({
    where: statusFilter ? { status: statusFilter as OrderStatus } : {},
    relations: { customer: true },
    order: { created_at: "DESC" }
  });
}

export async function addOrderFile(order: OrderEntity, file: Omit<OrderFileEntity, "id" | "created_at" | "order">) {
  assertCustomerEditable(order);
  const dataSource = await getDataSource();
  await dataSource.getRepository(OrderFileSchema).save({ id: randomUUID(), ...file });
  return getOrderOr404(order.id);
}

export async function deleteOrderFile(order: OrderEntity, fileId: string): Promise<OrderEntity> {
  assertCustomerEditable(order);
  const dataSource = await getDataSource();
  const repository = dataSource.getRepository(OrderFileSchema);
  const file = await repository.findOneBy({ id: fileId, order_id: order.id });
  if (!file) {
    throw new ApiError(404, "Order file not found");
  }
  await repository.delete({ id: file.id });
  await deleteStoredUpload(file.storage_path);
  return getOrderOr404(order.id);
}

export async function addOrderReference(order: OrderEntity, rawPayload: unknown): Promise<OrderReferenceEntity> {
  assertCustomerEditable(order);
  const payload = referenceSchema.parse(rawPayload);
  const dataSource = await getDataSource();
  const reference = await dataSource.getRepository(OrderReferenceSchema).save({
    id: randomUUID(),
    order_id: order.id,
    reference_type: payload.reference_type,
    title: payload.title.trim(),
    authors: compact(payload.authors),
    year: compact(payload.year),
    url: compact(payload.url),
    notes: compact(payload.notes),
    required_usage: payload.required_usage
  });
  return reference;
}

export async function updateOrderStatus(orderId: string, rawPayload: unknown) {
  const payload = statusPatchSchema.parse(rawPayload);
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    const order = await getOrderOr404(orderId, manager);
    await setOrderStatus(manager, order, payload.status, "admin", payload.notes);
  });
  return getOrderOr404(orderId);
}

export async function addReviewNote(orderId: string, rawPayload: unknown): Promise<ReviewNoteEntity> {
  const payload = reviewNoteSchema.parse(rawPayload);
  const dataSource = await getDataSource();
  await getOrderOr404(orderId);
  return dataSource.getRepository(ReviewNoteSchema).save({
    id: randomUUID(),
    order_id: orderId,
    author: payload.author,
    note: payload.note
  });
}

export async function addPaymentNote(
  orderId: string,
  rawPayload: unknown,
  receipt?: {
    original_name: string;
    stored_name: string;
    storage_path: string;
    content_type: string | null;
    size_bytes: number;
  }
): Promise<OrderEntity> {
  const payload = paymentNoteSchema.parse(rawPayload);
  const statusColumn = payload.note_type === "payment" ? "payment_status" : "moarref_payment_status";
  const dataSource = await getDataSource();
  await dataSource.transaction(async (manager) => {
    await getOrderOr404(orderId, manager);
    await manager.getRepository(OrderSchema).update(
      { id: orderId },
      {
        [statusColumn]: payload.payment_status,
        updated_at: new Date()
      }
    );
    await manager.getRepository(PaymentNoteSchema).save({
      id: randomUUID(),
      order_id: orderId,
      note_type: payload.note_type,
      payment_status: payload.payment_status,
      note: compact(payload.note),
      original_name: receipt?.original_name ?? null,
      stored_name: receipt?.stored_name ?? null,
      storage_path: receipt?.storage_path ?? null,
      content_type: receipt?.content_type ?? null,
      size_bytes: receipt?.size_bytes ?? null
    });
  });
  return getOrderOr404(orderId);
}

export async function findFinalOutput(orderId: string, outputId: string): Promise<FinalOutputEntity> {
  const dataSource = await getDataSource();
  const output = await dataSource.getRepository(FinalOutputSchema).findOneBy({
    id: outputId,
    order_id: orderId
  });
  if (!output) {
    throw new ApiError(404, "Output not found");
  }
  return output;
}

export async function deleteWorkerLock(manager: EntityManager, orderId: string): Promise<void> {
  await manager.getRepository(WorkerLockSchema).delete({ order_id: orderId });
}
