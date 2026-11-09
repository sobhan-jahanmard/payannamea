import "./env";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataSource } from "typeorm";

import { POST as phoneLogin } from "../app/api/auth/phone/route";
import { POST as requestOtp } from "../app/api/auth/otp/request/route";
import { POST as verifyOtp } from "../app/api/auth/otp/verify/route";
import { POST as staffLogin } from "../app/api/auth/login/route";
import { POST as requestConsultation } from "../app/api/leads/route";
import type { AuthResponse } from "../types/api";
import { decodeAccessToken, hashPassword } from "./auth";
import { getDataSource } from "./db/data-source";
import { email } from "./email";
import { ApiError } from "./http";
import { getRequestIp, normalizeIranianPhone } from "./phone";

test("phone normalization accepts local digits and country prefixes, rejects invalid numbers", () => {
  for (const input of ["09121234567", "۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧", "+98 (912) 123-4567", "00989121234567", "989121234567"]) {
    assert.equal(normalizeIranianPhone(input), "09121234567");
  }
  for (const input of ["", "0912", "08121234567", "091212345678", "0912abc4567"]) {
    assert.throws(() => normalizeIranianPhone(input), (error) => error instanceof ApiError && error.status === 422);
  }
});

test("signup IP only accepts valid proxy addresses", () => {
  assert.equal(getRequestIp(new Request("http://localhost", { headers: { "x-forwarded-for": "192.0.2.1, 192.0.2.2" } })), "192.0.2.1");
  assert.equal(getRequestIp(new Request("http://localhost", { headers: { "x-real-ip": "invalid" } })), null);
});

test("retired OTP endpoints cannot send messages or issue sessions", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  for (const handler of [requestOtp, verifyOtp]) {
    const response = await handler();
    assert.equal(response.status, 410);
    assert.equal((await response.json()).access_token, undefined);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("phone login, returning customers, staff isolation and consultation work without OTP", { skip: !process.env.DATABASE_URL }, async (t) => {
  const dataSource = await getDataSource();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const original = globalThis.payannameDataSource;
  const signupMock = t.mock.method(email, "sendNewUserSignup", async () => true);
  t.mock.method(email, "sendConsultationLead", async () => true);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  try {
    // All fixtures live in connection-local tables and disappear on rollback.
    await runner.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING DEFAULTS) ON COMMIT DROP");
    await runner.query("CREATE UNIQUE INDEX ON users(phone)");
    await runner.query("CREATE TEMP TABLE orders (LIKE public.orders INCLUDING DEFAULTS) ON COMMIT DROP");
    globalThis.payannameDataSource = {
      isInitialized: true,
      getRepository: runner.manager.getRepository.bind(runner.manager),
      transaction: runner.manager.transaction.bind(runner.manager)
    } as unknown as DataSource;

    const request = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body)
    });
    const login = (body: unknown, headers?: Record<string, string>) => phoneLogin(request("/api/auth/phone", body, headers));
    for (const body of [{}, { phone: "bad-number" }, { phone: 9121234567 }, { phone: "09121234567", utm_source: "x".repeat(101) }]) {
      assert.equal((await login(body)).status, 422);
    }
    assert.equal((await login({ phone: "09121234567" }, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await runner.query("SELECT count(*)::int AS total FROM users"))[0].total, 0);

    const first = await login({ phone: "۰۹۱۲۱۲۳۴۵۶۷", utm_source: "telegram" }, { "x-real-ip": "192.0.2.1" });
    assert.equal(first.status, 200);
    const session = await first.json() as AuthResponse;
    assert.equal(session.user.phone, "09121234567");
    assert.equal(session.user.role, "customer");
    assert.equal(session.user.is_verified, false);
    assert.deepEqual(decodeAccessToken(session.access_token), { sub: session.user.id, role: "customer" });
    assert.equal(signupMock.mock.callCount(), 1);

    await runner.query("UPDATE users SET admin_note = 'keep', admin_followup_status = 'closed' WHERE id = $1", [session.user.id]);
    await runner.query(`INSERT INTO orders (id, user_id, correspondence_email, degree, university, title, methodology, language)
      VALUES ('existing-order', $1, 'qa@example.invalid', 'کارشناسی', 'دانشگاه آزمایشی', 'سفارش آزمایشی', 'مرور', 'فارسی')`, [session.user.id]);
    const returning = await login({ phone: "+98 912 123 4567", utm_source: "replacement" }, { "x-real-ip": "192.0.2.2" });
    const returningSession = await returning.json() as AuthResponse;
    assert.equal(returning.status, 200);
    assert.equal(returningSession.user.id, session.user.id);
    assert.equal(signupMock.mock.callCount(), 1);
    const [stored] = await runner.query("SELECT * FROM users WHERE id = $1", [session.user.id]);
    assert.equal(stored.utm_source, "telegram");
    assert.equal(stored.signup_ip, "192.0.2.1");
    assert.equal(stored.admin_note, "keep");
    assert.equal(stored.admin_followup_status, "closed");
    assert.equal((await runner.query("SELECT user_id FROM orders WHERE id = 'existing-order'"))[0].user_id, returningSession.user.id);

    const consultation = await requestConsultation(request("/api/leads", { phone: "09351234567", source: "landing_page" }, { Authorization: `Bearer ${returningSession.access_token}` }));
    assert.equal(consultation.status, 201);
    const lead = await consultation.json();
    assert.equal(lead.id, session.user.id);
    assert.match(lead.message, /تلگرام/);
    assert.equal((await runner.query("SELECT admin_followup_status FROM users WHERE id = $1", [session.user.id]))[0].admin_followup_status, "new");
    assert.equal((await requestConsultation(request("/api/leads", {}))).status, 401);
    assert.equal((await runner.query("SELECT count(*)::int AS total FROM users"))[0].total, 1, "consultation must use the signed-in phone, ignoring a spoofed body phone");

    await runner.query(`INSERT INTO users (id, role, phone, is_verified, admin_note) VALUES
      ('old-customer', 'customer', '09351234567', true, 'historical'),
      ('lead-customer', 'customer', '09361234567', false, 'existing lead')`);
    for (const [phone, id, verified] of [["09351234567", "old-customer", true], ["09361234567", "lead-customer", false]] as const) {
      const response = await login({ phone });
      assert.equal(response.status, 200);
      const body = await response.json() as AuthResponse;
      assert.equal(body.user.id, id);
      assert.equal(body.user.is_verified, verified);
    }
    assert.equal(signupMock.mock.callCount(), 1);

    const staffPassword = hashPassword("test-staff-password");
    for (const [role, phone] of [["admin", "09131234567"], ["operator", "09141234567"]]) {
      await runner.query("INSERT INTO users (id, role, phone, username, password_hash) VALUES ($1, $1, $2, $1, $3)", [role, phone, staffPassword]);
      const rejected = await login({ phone });
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).access_token, undefined);
      const accepted = await staffLogin(request("/api/auth/login", { username: role, password: "test-staff-password" }));
      assert.equal(accepted.status, 200);
      const staffSession = await accepted.json() as AuthResponse;
      assert.equal(staffSession.user.role, role);
      assert.equal((await requestConsultation(request("/api/leads", {}, { Authorization: `Bearer ${staffSession.access_token}` }))).status, 403);
    }
    assert.equal(fetchMock.mock.callCount(), 0, "login and consultation must never call an SMS provider");
  } finally {
    globalThis.payannameDataSource = original;
    await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
});
