# Academic Services

Unified Next.js ordering system for theses, doctoral dissertations, proposals, research assignments, and presentations.

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
