import "../env";
import { getDataSource } from "../db/data-source";

async function main() {
  const db = await getDataSource();
  await db.query(`create table if not exists ai_reviews (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id) on delete cascade,
    action varchar(16) not null check (action in ('review', 'fix')),
    status varchar(16) not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
    parent_review_id varchar(36) references ai_reviews(id) on delete set null,
    output_file_ids jsonb not null default '[]'::jsonb,
    input_file_ids jsonb not null default '[]'::jsonb,
    requested_prompt text,
    score numeric(5,2),
    report text,
    fix_prompt text,
    applied_files jsonb not null default '[]'::jsonb,
    restart_step integer,
    error text,
    worker_id varchar(255),
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz
  )`);
  await db.query("create index if not exists ix_ai_reviews_order_created on ai_reviews(order_id, created_at desc)");
  await db.query("create index if not exists ix_ai_reviews_status_created on ai_reviews(status, created_at)");
  const columns = await db.query("select column_name from information_schema.columns where table_name = 'ai_reviews'");
  const names = new Set(columns.map((row: { column_name: string }) => row.column_name));
  if (!["id", "order_id", "action", "status", "score", "report", "fix_prompt", "requested_prompt"].every(name => names.has(name)))
    throw new Error("AI review schema verification failed");
  await db.destroy();
  console.log("AI review history schema is ready.");
}

main().catch(error => { console.error(error); process.exit(1); });
