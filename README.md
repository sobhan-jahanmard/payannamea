# Academic Services

Unified Next.js ordering system for bachelor’s and master’s theses, proposals, research assignments, and presentations.

For conversation-driven execution of all five order types, independent review,
and revisions in Codex, see [the Codex skill guide](codex_skills/README.md).

## Structure

```txt
frontend/  Next.js App Router + TypeScript + TypeORM API routes
worker/    Local worker helper and Codex instructions
backend/   Legacy FastAPI implementation kept as reference, not the active app path
```

## Active App

The active application is now `frontend/`. It serves both:

- Farsi RTL web UI
- `/api/*` backend routes for auth, orders, admin approval, files, and worker pickup

Customers first submit their phone to `POST /api/auth/phone/status`, which returns
`{ exists, next_step: "setup" | "login" | "staff" }` without creating an account or session.
`POST /api/auth/phone` requires `{ phone, password, utm_source?, purpose? }`. For a new
number or an existing customer without a password, `password_confirmation` must match
and the new password must be 8–128 characters. Only then is a session issued. Passwords
are stored as salted PBKDF2 hashes. Subsequent logins require the existing password
and reuse the same account and orders; password confirmation cannot overwrite it.
The consultation form uses `purpose: "consultation"`: an existing number shows
“درخواست مشاوره شما از قبل ثبت شده است.” and cannot register or sign in through that form.
The server also rejects duplicate consultation signups atomically with HTTP 409.
No OTP or SMS is sent. Registration does not verify ownership of the number
(`is_verified` remains false for new accounts). Staff
accounts must continue to use username/password login. The former OTP endpoints return
410 and never send messages. No MsgWay credentials are required.

Customer communication and order coordination take place through Telegram using the
registered phone number. The login, consultation, order pages, and shared footer explain
that customers should register with a number active on Telegram.
Run `npm run test:phone-auth` from `frontend/` to check the phone login and consultation flow.

## Supabase/PostgreSQL Setup

Create `frontend/.env.local`:

```bash
cd frontend
cp .env.example .env.local
```

Fill `DATABASE_URL` with the Supabase Postgres connection string:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/postgres?sslmode=require
AUTH_SECRET=change-this-local-secret
WORKER_API_KEY=local-worker-dev-key
STORAGE_DIR=storage
NEXT_PUBLIC_API_URL=
```

Then install, migrate, and run:

```bash
npm install
npm run db:migrate
npm run dev -- -p 5173
```

The order list uses `GET /api/orders?search=...&page=1&limit=20`, returning
`{ orders, pagination: { page, limit, total, pages } }`. Search matches the student's
name or customer mobile number within the signed-in user's permitted orders.
The UI debounces searches by 400 ms and cancels superseded requests.

For an existing database, run `npm run db:index-orders` from `frontend/` before
deploying this API. It adds normalized trigram search indexes and pagination
indexes concurrently; `db:migrate` includes the same setup for fresh databases.
Run `npm run test:order-list` to verify the API against PostgreSQL using temporary
fixture tables that are rolled back after the test.

Student search on the orders page is shown only to admins and operators.
The landing page reads per-page/per-slide rates and example quantities from
`service_pricing`; all amounts are stored in **toman**. Run
`npm run db:seed-service-pricing` for an existing database (`db:migrate` includes
it for fresh setups). Re-running setup fills missing services and preserves
edited rates. Run `npm run test:service-pricing` to verify stored rates,
example totals, and preservation of edits using a temporary PostgreSQL table.

Create/update an admin:

```bash
npm run db:create-admin -- \
  --email s.jahanmard@gmail.com \
  --password 123456789 \
  --name "سبحان جهان مرد" \
  --phone 09120000000
```

## Worker

The worker should call the unified Next app:

```bash
cd worker
cp .env.example .env
```

Default worker env:

```txt
BACKEND_URL=http://localhost:5173
WORKER_API_KEY=local-worker-dev-key
WORKER_ID=local-pc-1
WORKER_WORKSPACE=workspace
```

Run one mocked academic-order flow:

```bash
python scripts/local_worker.py run
cd workspace/order_<id>
python ../../scripts/local_worker.py mock-generate
python ../../scripts/local_worker.py submit-final
```

`submit-final` uploads the worker review package and moves the order to `worker_done_pending_approval`.
It validates the expected review files first and includes presentation `.pptx`
outputs when present.
Admins then inspect the package in the admin panel and set the status to `completed`
after approval.

The worker claims the oldest admin-approved order through:

```txt
POST /api/worker/orders/claim-oldest
```

## Notes

- Supabase data is visible in the Supabase Dashboard Table Editor or SQL Editor.
- `backend/` is no longer required for normal development.
- Uploaded files are stored under `frontend/storage/` by default and are ignored by git.
