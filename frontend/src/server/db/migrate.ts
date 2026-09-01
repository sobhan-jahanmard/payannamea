import "../env";

import { getDataSource } from "./data-source";

const statements = [
  `create table if not exists users (
    id varchar(36) primary key,
    full_name varchar(255) not null,
    username varchar(80) unique,
    email varchar(255) not null unique,
    phone varchar(40),
    password_hash varchar(255),
    role varchar(32) not null default 'customer',
    is_verified boolean not null default true,
    admin_followup_status varchar(32) not null default 'new',
    admin_note text not null default '',
    reset_token_hash varchar(128),
    reset_token_expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists ix_users_role on users(role)`,
  `alter table users add column if not exists is_verified boolean not null default true`,
  `create index if not exists ix_users_is_verified on users(is_verified)`,
  `alter table users add column if not exists username varchar(80)`,
  `create unique index if not exists uq_users_username on users(username) where username is not null`,
  `alter table users add column if not exists admin_followup_status varchar(32) not null default 'new'`,
  `alter table users add column if not exists admin_note text not null default ''`,
  `alter table users add column if not exists utm_source varchar(100)`,
  `alter table users add column if not exists signup_ip varchar(45)`,
  `alter table users add column if not exists updated_at timestamptz not null default now()`,
  `create index if not exists ix_users_updated_at on users(updated_at desc)`,
  `create index if not exists ix_users_admin_followup_status on users(admin_followup_status)`,
  `alter table users alter column full_name drop not null`,
  `alter table users alter column email drop not null`,
  `create unique index if not exists uq_users_phone on users(phone) where phone is not null`,
  `create table if not exists orders (
    id varchar(36) primary key,
    user_id varchar(36) not null references users(id) on delete cascade,
    created_by_user_id varchar(36) references users(id) on delete set null,
    status varchar(32) not null default 'submitted',
    payment_status varchar(32) not null default 'not_paid',
    moarref_payment_status varchar(32) not null default 'not_paid',
    correspondence_email varchar(255) not null,
    degree varchar(120) not null,
    university varchar(255) not null,
    title varchar(500) not null,
    student_name varchar(255),
    student_number varchar(80),
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
    requires_charts boolean not null default false,
    service_type varchar(160),
    project_stage varchar(160),
    proposal_status varchar(160),
    required_chapters varchar(255),
    analysis_software varchar(255),
    deadline timestamptz,
    word_count integer,
    notes text,
    moarref_code varchar(120),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists ix_orders_created_at on orders(created_at)`,
  `alter table orders add column if not exists created_by_user_id varchar(36) references users(id) on delete set null`,
  `create index if not exists ix_orders_created_by_user_id on orders(created_by_user_id)`,
  `create index if not exists ix_orders_status on orders(status)`,
  `alter table orders add column if not exists student_name varchar(255)`,
  `alter table orders add column if not exists student_number varchar(80)`,
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
  `alter table orders add column if not exists requires_charts boolean not null default false`,
  `alter table orders alter column deadline type timestamptz using deadline::timestamptz`,
  `update orders set status = 'in_progress' where status in ('queued', 'locked_by_worker', 'waiting_for_review', 'revision_required')`,
  `update orders set status = 'submitted' where status in ('draft', 'cancelled')`,
  `alter table orders add column if not exists service_type varchar(160)`,
  `alter table orders add column if not exists project_stage varchar(160)`,
  `alter table orders add column if not exists proposal_status varchar(160)`,
  `alter table orders add column if not exists required_chapters varchar(255)`,
  `alter table orders add column if not exists analysis_software varchar(255)`,
  `alter table orders add column if not exists payment_status varchar(32) not null default 'not_paid'`,
  `alter table orders add column if not exists moarref_payment_status varchar(32) not null default 'not_paid'`,
  `alter table orders add column if not exists correspondence_email varchar(255)`,
  `update orders set correspondence_email = users.email
    from users
    where orders.user_id = users.id and orders.correspondence_email is null and users.email is not null`,
  `update orders set correspondence_email = 'unknown@example.invalid' where correspondence_email is null`,
  `alter table orders alter column correspondence_email set not null`,
  `alter table orders add column if not exists moarref_code varchar(120)`,
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
  `create index if not exists ix_review_notes_order_id on review_notes(order_id)`,
  `create table if not exists payment_notes (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    note_type varchar(32) not null,
    payment_status varchar(32) not null,
    note text,
    original_name varchar(500),
    stored_name varchar(500),
    storage_path varchar(1000),
    content_type varchar(255),
    size_bytes integer,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_payment_notes_order_id on payment_notes(order_id)`,
  `create table if not exists otp_challenges (
    id varchar(36) primary key,
    phone varchar(40) not null,
    code_hash varchar(128) not null,
    expires_at timestamptz not null,
    attempts integer not null default 0,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_otp_challenges_phone_created_at on otp_challenges(phone, created_at)`,
  `create index if not exists ix_otp_challenges_expires_at on otp_challenges(expires_at)`,
  `create table if not exists analytics_events (
    id varchar(36) primary key,
    visitor_id varchar(36) not null,
    session_id varchar(36) not null,
    event_name varchar(120) not null,
    path varchar(500) not null,
    properties jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists ix_analytics_events_created_at on analytics_events(created_at)`,
  `create index if not exists ix_analytics_events_event_name on analytics_events(event_name)`,
  `create index if not exists ix_analytics_events_path on analytics_events(path)`,
  `create index if not exists ix_analytics_events_visitor_id on analytics_events(visitor_id)`,
  `create index if not exists ix_analytics_events_session_id on analytics_events(session_id)`,
  `do $$
   begin
     if to_regclass('public.consultation_leads') is not null then
       insert into users (id, full_name, email, phone, password_hash, role, is_verified, admin_followup_status, admin_note, reset_token_hash, reset_token_expires_at, created_at)
       select id, null, null, phone, null, 'customer', false, status, admin_note, null, null, created_at
       from consultation_leads
       on conflict (phone) where phone is not null do nothing;
       drop table consultation_leads;
     end if;
   end $$`
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
