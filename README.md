# License Lifecycle Hub

This repository now contains a full-stack replacement for the spreadsheet-based tracker:

- FastAPI backend with CRUD APIs, workbook import/export, audit logs, JWT auth, role-based access, and smart lifecycle classification.
- React + Material UI frontend with a dashboard-first experience, charts, filtering, inline edit drawer, risk panel, and workflow alerts.
- PostgreSQL-first persistence with a simple fallback path if you temporarily switch the `DATABASE_URL` to SQLite during local prototyping.
- The original `tracker.py` CLI remains in the repo as a legacy utility and reference for workbook parsing behavior.

## Core Capabilities

- License register with lifecycle, usage, cost, ownership, and certificate fields.
- Smart status engine for `Expired`, `Urgent`, `Review`, and `Active` states.
- Risk detection for over-utilization, under-utilization, past EOL, and missing critical fields.
- Dashboard KPIs, expiry trend chart, category mix, utilization heatmap, risk queue, and predictive spend signals.
- Role-based access with seeded `admin`, `ops`, and `viewer` demo users.
- XLSX import/export to migrate from the existing workbook.
- Audit trail showing who changed what and when.
- API-first design for future CMDB, monitoring, vendor API, Slack, or email integration.

## Architecture

- Backend: `backend/app/main.py`
- Frontend: `frontend/src/App.tsx`
- Database: PostgreSQL via `psycopg`
- Workbook source reference: `license_subscription_tracker.xlsx`

## Local Setup

### 1. Configure environment

Copy `.env.example` to `.env` and adjust values as needed.

Default backend configuration expects PostgreSQL:

```powershell
DATABASE_URL=postgresql+psycopg://tracker:tracker@localhost:5432/license_tracker
```

If you need a zero-setup local fallback, you can temporarily use:

```powershell
DATABASE_URL=sqlite:///./license_tracker.db
```

### 2. Install backend dependencies

```powershell
cd d:\Projects\license-subscription-tracker
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Start the API

```powershell
cd d:\Projects\license-subscription-tracker
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Install and start the frontend

```powershell
cd d:\Projects\license-subscription-tracker\frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies API requests to `http://localhost:8000`.

## Spreadsheet Migration

Use the import action in the UI to upload `license_subscription_tracker.xlsx` or any compatible workbook. The importer:

- auto-detects the best worksheet,
- maps known column aliases,
- creates new records,
- updates existing records when the license reference or core identity matches,
- recalculates lifecycle and utilization metrics on import.

## API Highlights

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/licenses`
- `POST /api/licenses`
- `PATCH /api/licenses/{id}`
- `DELETE /api/licenses/{id}`
- `POST /api/import/xlsx`
- `GET /api/export/xlsx`
- `GET /api/audit-logs`
- `GET /api/insights`

## Notes

- Email and Slack notification delivery are not wired to external providers yet, but the alerting and queue logic are exposed through the API and dashboard so those integrations can be added cleanly.
- PostgreSQL is the intended production database. SQLite is only a local convenience fallback.
- The backend currently seeds demo users on startup if they do not already exist.
