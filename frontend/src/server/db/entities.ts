import { EntitySchema } from "typeorm";

export const ORDER_STATUSES = [
  "submitted",
  "approved",
  "in_progress",
  "worker_done_pending_approval",
  "admin_review",
  "completed",
  "failed"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type UserRole = "customer" | "admin";

export interface UserEntity {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
  role: UserRole;
  reset_token_hash: string | null;
  reset_token_expires_at: Date | null;
  created_at: Date;
  orders?: OrderEntity[];
}

export interface OrderEntity {
  id: string;
  user_id: string;
  status: OrderStatus;
  degree: string;
  university: string;
  title: string;
  order_type: string | null;
  methodology: string;
  language: string;
  academic_style: string;
  field_of_study: string | null;
  faculty: string | null;
  department: string | null;
  advisor_name: string | null;
  consultant_name: string | null;
  instructor_name: string | null;
  course_name: string | null;
  title_english: string | null;
  keywords: string | null;
  abstract: string | null;
  slide_count: number | null;
  quantity_type: string | null;
  quantity_value: number | null;
  image_count: number | null;
  service_type: string | null;
  project_stage: string | null;
  proposal_status: string | null;
  required_chapters: string | null;
  analysis_software: string | null;
  deadline: Date | null;
  word_count: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  customer?: UserEntity;
  files?: OrderFileEntity[];
  references?: OrderReferenceEntity[];
  status_logs?: OrderStatusLogEntity[];
  worker_lock?: WorkerLockEntity | null;
  worker_submissions?: WorkerSubmissionEntity[];
  final_outputs?: FinalOutputEntity[];
  review_notes?: ReviewNoteEntity[];
}

export interface OrderFileEntity {
  id: string;
  order_id: string;
  file_type: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  created_at: Date;
  order?: OrderEntity;
}

export interface OrderReferenceEntity {
  id: string;
  order_id: string;
  reference_type: string;
  title: string;
  authors: string | null;
  year: string | null;
  url: string | null;
  notes: string | null;
  required_usage: boolean;
  created_at: Date;
  order?: OrderEntity;
}

export interface OrderStatusLogEntity {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: OrderStatus;
  actor: string;
  notes: string | null;
  created_at: Date;
  order?: OrderEntity;
}

export interface WorkerLockEntity {
  id: string;
  order_id: string;
  worker_id: string;
  locked_at: Date;
  lock_expires_at: Date;
  heartbeat_at: Date;
  order?: OrderEntity;
}

export interface WorkerSubmissionEntity {
  id: string;
  order_id: string;
  worker_id: string;
  submission_type: string;
  notes: string | null;
  created_at: Date;
  order?: OrderEntity;
  outputs?: FinalOutputEntity[];
}

export interface FinalOutputEntity {
  id: string;
  order_id: string;
  worker_submission_id: string | null;
  output_type: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number;
  notes: string | null;
  created_at: Date;
  order?: OrderEntity;
  worker_submission?: WorkerSubmissionEntity | null;
}

export interface ReviewNoteEntity {
  id: string;
  order_id: string;
  author: string;
  note: string;
  created_at: Date;
  order?: OrderEntity;
}

const idColumn = {
  type: String,
  primary: true,
  length: 36
} as const;

const createdAtColumn = {
  type: "timestamptz",
  createDate: true
} as const;

export const UserSchema = new EntitySchema<UserEntity>({
  name: "User",
  tableName: "users",
  columns: {
    id: idColumn,
    full_name: { type: String, length: 255 },
    email: { type: String, length: 255, unique: true },
    phone: { type: String, length: 40, nullable: true },
    password_hash: { type: String, length: 255, nullable: true },
    role: { type: String, length: 32, default: "customer" },
    reset_token_hash: { type: String, length: 128, nullable: true },
    reset_token_expires_at: { type: "timestamptz", nullable: true },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_users_role", columns: ["role"] }],
  relations: {
    orders: {
      type: "one-to-many",
      target: "Order",
      inverseSide: "customer"
    }
  }
});

export const OrderSchema = new EntitySchema<OrderEntity>({
  name: "Order",
  tableName: "orders",
  columns: {
    id: idColumn,
    user_id: { type: String, length: 36 },
    status: { type: String, length: 32, default: "submitted" },
    degree: { type: String, length: 120 },
    university: { type: String, length: 255 },
    title: { type: String, length: 500 },
    order_type: { type: String, length: 120, nullable: true },
    methodology: { type: String, length: 160 },
    language: { type: String, length: 80 },
    academic_style: { type: String, length: 120 },
    field_of_study: { type: String, length: 255, nullable: true },
    faculty: { type: String, length: 255, nullable: true },
    department: { type: String, length: 255, nullable: true },
    advisor_name: { type: String, length: 255, nullable: true },
    consultant_name: { type: String, length: 255, nullable: true },
    instructor_name: { type: String, length: 255, nullable: true },
    course_name: { type: String, length: 255, nullable: true },
    title_english: { type: String, length: 500, nullable: true },
    keywords: { type: String, length: 500, nullable: true },
    abstract: { type: "text", nullable: true },
    slide_count: { type: Number, nullable: true },
    quantity_type: { type: String, length: 40, nullable: true },
    quantity_value: { type: Number, nullable: true },
    image_count: { type: Number, nullable: true },
    service_type: { type: String, length: 160, nullable: true },
    project_stage: { type: String, length: 160, nullable: true },
    proposal_status: { type: String, length: 160, nullable: true },
    required_chapters: { type: String, length: 255, nullable: true },
    analysis_software: { type: String, length: 255, nullable: true },
    deadline: { type: "timestamptz", nullable: true },
    word_count: { type: Number, nullable: true },
    notes: { type: "text", nullable: true },
    created_at: createdAtColumn,
    updated_at: { type: "timestamptz", updateDate: true }
  },
  indices: [
    { name: "ix_orders_created_at", columns: ["created_at"] },
    { name: "ix_orders_status", columns: ["status"] }
  ],
  relations: {
    customer: {
      type: "many-to-one",
      target: "User",
      inverseSide: "orders",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE"
    },
    files: { type: "one-to-many", target: "OrderFile", inverseSide: "order" },
    references: { type: "one-to-many", target: "OrderReference", inverseSide: "order" },
    status_logs: { type: "one-to-many", target: "OrderStatusLog", inverseSide: "order" },
    worker_lock: { type: "one-to-one", target: "WorkerLock", inverseSide: "order" },
    worker_submissions: { type: "one-to-many", target: "WorkerSubmission", inverseSide: "order" },
    final_outputs: { type: "one-to-many", target: "FinalOutput", inverseSide: "order" },
    review_notes: { type: "one-to-many", target: "ReviewNote", inverseSide: "order" }
  }
});

export const OrderFileSchema = new EntitySchema<OrderFileEntity>({
  name: "OrderFile",
  tableName: "order_files",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    file_type: { type: String, length: 80 },
    original_name: { type: String, length: 500 },
    stored_name: { type: String, length: 500 },
    storage_path: { type: String, length: 1000 },
    content_type: { type: String, length: 255, nullable: true },
    size_bytes: { type: Number },
    uploaded_by: { type: String, length: 80, default: "customer" },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_order_files_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "files",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    }
  }
});

export const OrderReferenceSchema = new EntitySchema<OrderReferenceEntity>({
  name: "OrderReference",
  tableName: "order_references",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    reference_type: { type: String, length: 80 },
    title: { type: String, length: 500 },
    authors: { type: String, length: 500, nullable: true },
    year: { type: String, length: 20, nullable: true },
    url: { type: String, length: 1000, nullable: true },
    notes: { type: "text", nullable: true },
    required_usage: { type: Boolean, default: true },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_order_references_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "references",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    }
  }
});

export const OrderStatusLogSchema = new EntitySchema<OrderStatusLogEntity>({
  name: "OrderStatusLog",
  tableName: "order_status_logs",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    from_status: { type: String, length: 32, nullable: true },
    to_status: { type: String, length: 32 },
    actor: { type: String, length: 120 },
    notes: { type: "text", nullable: true },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_order_status_logs_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "status_logs",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    }
  }
});

export const WorkerLockSchema = new EntitySchema<WorkerLockEntity>({
  name: "WorkerLock",
  tableName: "worker_locks",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36, unique: true },
    worker_id: { type: String, length: 255 },
    locked_at: { type: "timestamptz" },
    lock_expires_at: { type: "timestamptz" },
    heartbeat_at: { type: "timestamptz" }
  },
  indices: [{ name: "ix_worker_locks_worker_id", columns: ["worker_id"] }],
  relations: {
    order: {
      type: "one-to-one",
      target: "Order",
      inverseSide: "worker_lock",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    }
  }
});

export const WorkerSubmissionSchema = new EntitySchema<WorkerSubmissionEntity>({
  name: "WorkerSubmission",
  tableName: "worker_submissions",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    worker_id: { type: String, length: 255 },
    submission_type: { type: String, length: 80 },
    notes: { type: "text", nullable: true },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_worker_submissions_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "worker_submissions",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    },
    outputs: {
      type: "one-to-many",
      target: "FinalOutput",
      inverseSide: "worker_submission"
    }
  }
});

export const FinalOutputSchema = new EntitySchema<FinalOutputEntity>({
  name: "FinalOutput",
  tableName: "final_outputs",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    worker_submission_id: { type: String, length: 36, nullable: true },
    output_type: { type: String, length: 80 },
    original_name: { type: String, length: 500 },
    stored_name: { type: String, length: 500 },
    storage_path: { type: String, length: 1000 },
    content_type: { type: String, length: 255, nullable: true },
    size_bytes: { type: Number },
    notes: { type: "text", nullable: true },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_final_outputs_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "final_outputs",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    },
    worker_submission: {
      type: "many-to-one",
      target: "WorkerSubmission",
      inverseSide: "outputs",
      joinColumn: { name: "worker_submission_id" },
      onDelete: "SET NULL",
      nullable: true
    }
  }
});

export const ReviewNoteSchema = new EntitySchema<ReviewNoteEntity>({
  name: "ReviewNote",
  tableName: "review_notes",
  columns: {
    id: idColumn,
    order_id: { type: String, length: 36 },
    author: { type: String, length: 255 },
    note: { type: "text" },
    created_at: createdAtColumn
  },
  indices: [{ name: "ix_review_notes_order_id", columns: ["order_id"] }],
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      inverseSide: "review_notes",
      joinColumn: { name: "order_id" },
      onDelete: "CASCADE"
    }
  }
});

export const entities = [
  UserSchema,
  OrderSchema,
  OrderFileSchema,
  OrderReferenceSchema,
  OrderStatusLogSchema,
  WorkerLockSchema,
  WorkerSubmissionSchema,
  FinalOutputSchema,
  ReviewNoteSchema
];
