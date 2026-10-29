import "./env";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";
import type { OrdersListResponse } from "../types/api";

import { GET } from "../app/api/orders/route";
import { createAccessToken } from "./auth";
import { getDataSource } from "./db/data-source";
import type { UserEntity } from "./db/entities";
import { normalizeOrderSearch, orderSearchExpression } from "./order-search";

test("orders API paginates and searches in PostgreSQL without crossing role boundaries", { skip: !process.env.DATABASE_URL }, async () => {
  const dataSource = await getDataSource();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const original = globalThis.payannameDataSource;
  try {
    // Connection-local tables shadow the real ones; fixtures and deletes cannot
    // affect application data, and rollback drops both tables.
    await runner.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING DEFAULTS) ON COMMIT DROP");
    await runner.query("CREATE TEMP TABLE orders (LIKE public.orders INCLUDING DEFAULTS) ON COMMIT DROP");
    await runner.query(`INSERT INTO users (id, role, phone) VALUES
      ('admin', 'admin', NULL), ('operator-a', 'operator', NULL), ('operator-b', 'operator', NULL),
      ('student-a', 'customer', '09121234567'), ('student-b', 'customer', '09351234567')`);
    await runner.query(`INSERT INTO orders
      (id, user_id, created_by_user_id, correspondence_email, degree, university, title, methodology, language, student_name, created_at)
      SELECT 'qa-' || lpad(i::text, 3, '0'),
        CASE WHEN i <= 25 THEN 'student-a' ELSE 'student-b' END,
        CASE WHEN i <= 25 THEN 'operator-a' ELSE 'operator-b' END,
        'qa@example.invalid', 'کارشناسی', 'دانشگاه آزمایشی', 'سفارش آزمایشی', 'مرور', 'فارسی',
        CASE WHEN i = 1 THEN '100%_دانشجو' WHEN i = 3 THEN 'علی 09121234567' WHEN i <= 25 THEN 'علي كاظمي' ELSE 'مریم رضایی' END,
        '2026-10-01T00:00:00Z'::timestamptz
      FROM generate_series(1, 45) i`);

    globalThis.payannameDataSource = {
      isInitialized: true,
      manager: runner.manager,
      getRepository: runner.manager.getRepository.bind(runner.manager),
    } as unknown as DataSource;
    const call = (role: UserEntity["role"], id: string, query = "") => {
      const token = createAccessToken({ id, role } as UserEntity);
      return GET(new Request(`http://localhost/api/orders${query}`, { headers: { Authorization: `Bearer ${token}` } }));
    };
    const result = async (role: UserEntity["role"], id: string, params = {}) => {
      const response = await call(role, id, `?${new URLSearchParams(params).toString()}`);
      assert.equal(response.status, 200);
      return response.json() as Promise<OrdersListResponse>;
    };
    assert.equal((await GET(new Request("http://localhost/api/orders"))).status, 401);
    for (const query of ["?page=0", "?page=1.5", "?limit=101", "?limit=0", `?search=${"a".repeat(121)}`]) {
      assert.equal((await call("admin", "admin", query)).status, 422);
    }

    const first = await result("admin", "admin");
    const second = await result("admin", "admin", { page: "2" });
    const last = await result("admin", "admin", { page: "999" });
    assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 45, pages: 3 });
    assert.equal(first.orders[0].id, "qa-045", "tied dates need deterministic id ordering");
    assert.equal(last.pagination.page, 3);
    assert.equal(last.orders.length, 5);
    assert.equal(new Set([...first.orders, ...second.orders, ...last.orders].map(order => order.id)).size, 45);

    for (const search of ["علی کاظمی", "عَلِي كاظمي", "علی‌کاظمی"]) {
      const found = await result("admin", "admin", { search });
      assert.equal(found.pagination.total, 23, search);
    }
    for (const search of ["0912", "۰۹۱۲", "٠٩١٢", "0912 123-4567"]) {
      assert.equal((await result("admin", "admin", { search })).pagination.total, 25, search);
    }
    for (const search of ["%", "_"]) {
      assert.equal((await result("admin", "admin", { search })).pagination.total, 1, "LIKE metacharacters must be literal");
    }
    assert.equal((await result("customer", "student-a")).pagination.total, 25);
    assert.equal((await result("operator", "operator-a")).pagination.total, 25);
    for (const search of ["مریم", "0935"]) {
      assert.equal((await result("customer", "student-a", { search })).pagination.total, 0);
      assert.equal((await result("operator", "operator-a", { search })).pagination.total, 0);
      assert.equal((await result("admin", "admin", { search })).pagination.total, 20);
    }
    assert.deepEqual((await result("admin", "admin", { search: "پیدا نمی‌شود" })).pagination, { page: 1, limit: 20, total: 0, pages: 1 });
    await runner.query("DELETE FROM orders WHERE id > 'qa-040'");
    assert.equal((await result("admin", "admin", { page: "3" })).pagination.page, 2);

    for (const input of ["عَلِي‌ كاظمي", "۰۹۱۲-٣٤٥", "ﻋﻠﻲ", "Test (Name)", "100%_دانشجو"]) {
      const [row] = await runner.query(`SELECT ${orderSearchExpression("$1::text")} AS normalized`, [input]);
      assert.equal(row.normalized, normalizeOrderSearch(input));
    }
    const indexes: { relname: string; indisvalid: boolean }[] = await runner.query(`SELECT c.relname, i.indisvalid
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)`, [[
      "ix_orders_student_name_search_trgm", "ix_users_phone_search_trgm", "ix_orders_created_id", "ix_orders_user_created_id", "ix_orders_creator_created_id",
    ]]);
    assert.equal(indexes.length, 5);
    assert.ok(indexes.every(index => index.indisvalid));
    await runner.query("SET LOCAL enable_seqscan = off");
    for (const [table, column, index] of [
      ["orders", "student_name", "ix_orders_student_name_search_trgm"],
      ["users", "phone", "ix_users_phone_search_trgm"],
    ]) {
      const plan = await runner.query(`EXPLAIN SELECT id FROM public.${table} WHERE ${orderSearchExpression(column)} LIKE $1`, ["%123%"]);
      assert.ok(JSON.stringify(plan).includes(index), `Search expression must be eligible for ${index}`);
    }
  } finally {
    globalThis.payannameDataSource = original;
    await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
});
