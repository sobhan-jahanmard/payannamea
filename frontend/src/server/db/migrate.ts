import "../env";

import { getDataSource } from "./data-source";

const statements = [
  `create table if not exists users (
    id varchar(36) primary key,
    full_name varchar(255) not null,
    email varchar(255) not null unique,
    phone varchar(40),
    password_hash varchar(255),
    role varchar(32) not null default 'customer',
    reset_token_hash varchar(128),
    reset_token_expires_at timestamptz,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_users_role on users(role)`,
  `create table if not exists orders (
    id varchar(36) primary key,
    user_id varchar(36) not null references users(id) on delete cascade,
    status varchar(32) not null default 'submitted',
    degree varchar(120) not null,
    university varchar(255) not null,
    title varchar(500) not null,
    order_type varchar(120),
    methodology varchar(160) not null,
    language varchar(80) not null,
    academic_style varchar(120) not null,
    field_of_study varchar(255),
    faculty varchar(255),
    department varchar(255),
    advisor_name varchar(255),
    consultant_name varchar(255),
    instructor_name varchar(255),
    course_name varchar(255),
    title_english varchar(500),
    keywords varchar(500),
    abstract text,
    slide_count integer,
    quantity_type varchar(40),
    quantity_value integer,
    image_count integer,
    service_type varchar(160),
    project_stage varchar(160),
    proposal_status varchar(160),
    required_chapters varchar(255),
    analysis_software varchar(255),
    deadline timestamptz,
    word_count integer,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists ix_orders_created_at on orders(created_at)`,
  `create index if not exists ix_orders_status on orders(status)`,
  `alter table orders add column if not exists order_type varchar(120)`,
  `alter table orders add column if not exists faculty varchar(255)`,
  `alter table orders add column if not exists department varchar(255)`,
  `alter table orders add column if not exists advisor_name varchar(255)`,
  `alter table orders add column if not exists consultant_name varchar(255)`,
  `alter table orders add column if not exists instructor_name varchar(255)`,
  `alter table orders add column if not exists course_name varchar(255)`,
  `alter table orders add column if not exists title_english varchar(500)`,
  `alter table orders add column if not exists keywords varchar(500)`,
  `alter table orders add column if not exists abstract text`,
  `alter table orders add column if not exists slide_count integer`,
  `alter table orders add column if not exists quantity_type varchar(40)`,
  `alter table orders add column if not exists quantity_value integer`,
  `alter table orders add column if not exists image_count integer`,
  `alter table orders alter column deadline type timestamptz using deadline::timestamptz`,
  `update orders set status = 'in_progress' where status in ('queued', 'locked_by_worker', 'waiting_for_review', 'revision_required')`,
  `update orders set status = 'submitted' where status in ('draft', 'cancelled')`,
  `alter table orders add column if not exists service_type varchar(160)`,
  `alter table orders add column if not exists project_stage varchar(160)`,
  `alter table orders add column if not exists proposal_status varchar(160)`,
  `alter table orders add column if not exists required_chapters varchar(255)`,
  `alter table orders add column if not exists analysis_software varchar(255)`,
  `create table if not exists order_files (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    file_type varchar(80) not null,
    original_name varchar(500) not null,
    stored_name varchar(500) not null,
    storage_path varchar(1000) not null,
    content_type varchar(255),
    size_bytes integer not null,
    uploaded_by varchar(80) not null default 'customer',
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_order_files_order_id on order_files(order_id)`,
  `create table if not exists order_references (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    reference_type varchar(80) not null,
    title varchar(500) not null,
    authors varchar(500),
    year varchar(20),
    url varchar(1000),
    notes text,
    required_usage boolean not null default true,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_order_references_order_id on order_references(order_id)`,
  `create table if not exists order_status_logs (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    from_status varchar(32),
    to_status varchar(32) not null,
    actor varchar(120) not null,
    notes text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_order_status_logs_order_id on order_status_logs(order_id)`,
  `create table if not exists worker_locks (
    id varchar(36) primary key,
    order_id varchar(36) not null unique references orders(id) on delete cascade,
    worker_id varchar(255) not null,
    locked_at timestamptz not null,
    lock_expires_at timestamptz not null,
    heartbeat_at timestamptz not null
  )`,
  `create index if not exists ix_worker_locks_worker_id on worker_locks(worker_id)`,
  `create table if not exists worker_submissions (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    worker_id varchar(255) not null,
    submission_type varchar(80) not null,
    notes text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_worker_submissions_order_id on worker_submissions(order_id)`,
  `create table if not exists final_outputs (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    worker_submission_id varchar(36) references worker_submissions(id) on delete set null,
    output_type varchar(80) not null,
    original_name varchar(500) not null,
    stored_name varchar(500) not null,
    storage_path varchar(1000) not null,
    content_type varchar(255),
    size_bytes integer not null,
    notes text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_final_outputs_order_id on final_outputs(order_id)`,
  `create table if not exists review_notes (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    author varchar(255) not null,
    note text not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_review_notes_order_id on review_notes(order_id)`
];

async function main() {
  const dataSource = await getDataSource();
  for (const statement of statements) {
    await dataSource.query(statement);
  }
  await dataSource.destroy();
  console.log("PostgreSQL schema is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
