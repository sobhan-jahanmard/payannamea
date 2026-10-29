import type { DataSource } from "typeorm";

import { orderSearchExpression } from "../order-search";

export async function ensureOrderListIndexes(dataSource: DataSource) {
  await dataSource.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const [extension] = await dataSource.query(`
    SELECT quote_ident(n.nspname) AS schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
  `);
  const indexes = [
    ["ix_orders_student_name_search_trgm", `ON public.orders USING gin ((${orderSearchExpression("student_name")}) ${extension.schema}.gin_trgm_ops)`],
    ["ix_users_phone_search_trgm", `ON public.users USING gin ((${orderSearchExpression("phone")}) ${extension.schema}.gin_trgm_ops)`],
    ["ix_orders_created_id", "ON public.orders (created_at DESC, id DESC)"],
    ["ix_orders_user_created_id", "ON public.orders (user_id, created_at DESC, id DESC)"],
    ["ix_orders_creator_created_id", "ON public.orders (created_by_user_id, created_at DESC, id DESC)"],
  ];
  // This runs outside a transaction, including when called by db:migrate.
  for (const [name, definition] of indexes) {
    await dataSource.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ${definition}`);
    const [index] = await dataSource.query(`
      SELECT i.indisvalid FROM pg_index i
      WHERE i.indexrelid = to_regclass($1)
    `, [`public.${name}`]);
    if (!index?.indisvalid) throw new Error(`Index ${name} is invalid; rebuild it before retrying.`);
    console.log(`Verified index: ${name}`);
  }
}
