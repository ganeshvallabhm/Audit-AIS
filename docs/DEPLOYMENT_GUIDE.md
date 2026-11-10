# CompanyAudit — Local & Enterprise Deployment Guide

**Scope:** Local developer stack and local production-simulation deployment via Docker Compose, Nginx reverse proxy, FastAPI (Uvicorn), and PostgreSQL 16.  
*(Note: No external cloud hosting is configured or invoked by these instructions.)*

---

## 1. Architecture & Runtime Topology

| Component | Technology | Internal / Host Port | Source Definition |
| :--- | :--- | :--- | :--- |
| **Reverse Proxy & SPA** | Nginx `1.27-alpine` + Vite 6 / React 19 static bundle | `80` (container) -> `${FRONTEND_PORT:-8080}` (host) | `Dockerfile`, `nginx.conf` |
| **Application API** | Python 3.13 + FastAPI + Uvicorn | `8000` (internal Docker network in prod; `127.0.0.1:8000` in dev) | `backend/Dockerfile`, `backend/app/main.py` |
| **Relational Database** | PostgreSQL `16-alpine` (`psycopg3`) | `5432` (Docker network) / `${POSTGRES_PORT:-5433}` (dev host) | `docker-compose.yml`, `docker-compose.prod.yml` |
| **Evidence Storage** | Local persistent filesystem / Docker volume (`companyaudit_prod_evidence`) | `/app/storage/evidence` (container) / `./backend/storage/evidence` (dev) | `backend/app/services/evidence_storage.py` |

Nginx (`nginx.conf`) serves static Vite build artifacts (`/assets/` with `1y immutable` cache headers), enforces `client_max_body_size 28M` (aligned with the `25 MB` application upload limit in `MAX_EVIDENCE_BYTES=26214400`), appends baseline security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), and reverse-proxies `/api/` to `http://backend:8000/api/`.

---

## 2. Environment Configuration

Copy the environment templates before launching either stack:

```powershell
# PowerShell (Windows)
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

```bash
# Bash (Linux / macOS)
cp .env.example .env
cp backend/.env.example backend/.env
```

### 2.1 Required Environment Variables

| Variable | Dev Default (`development`) | Staging / Production Constraint (`production` / `staging`) | Description |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | `production` or `staging` | Controls API Swagger docs (`/api/docs` only enabled in `development`/`test`) and strict validation guards. |
| `DATABASE_URL` | `postgresql+psycopg://companyaudit:<pw>@localhost:5433/companyaudit` | Container DSN (`@db:5432/...`) | Primary PostgreSQL SQLAlchemy URL (`psycopg` v3 driver). |
| `TEST_DATABASE_URL` | `postgresql+psycopg://companyaudit:<pw>@localhost:5433/companyaudit_test` | Optional in prod | Dedicated isolated PostgreSQL database used by `pytest`. |
| `JWT_SECRET_KEY` | 32+ char local secret | Must NOT contain `replace_with` and must be `>= 32` chars (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) | Signing key for `HS256` access & refresh JWTs. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | `15`–`30` recommended | In-memory access JWT TTL (minutes). |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | `7` | DB-tracked `RefreshSession` + HttpOnly cookie lifetime (days). |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173` | Explicit HTTPS origin(s); wildcard `*` raises startup `ValueError` | Used for both CORS middleware and CSRF `Origin`/`Referer` enforcement. |
| `COOKIE_SECURE` | `false` (HTTP localhost) | **Must be `true`** (enforced by `Settings.validate_production_posture`) | Controls the `Secure` attribute on `companyaudit_refresh` and `companyaudit_csrf`. Requires TLS termination in front of Nginx. |
| `ALLOW_DEMO_SEED` | `true` (dev seeding only) | **Must be `false`** (enforced by `Settings.validate_production_posture`) | Prevents running demo data seeders against production databases. |
| `DEMO_ACCOUNT_PASSWORD` | Strong dev password (never committed) | Leave unset in production | Password assigned solely by `backend/app/seeds/seed_data.py` during local development initialization. |
| `EVIDENCE_STORAGE_DIR` | `./storage/evidence` | `/app/storage/evidence` (persistent volume) | Out-of-webroot directory for SHA-256 verified uploads. |
| `MAX_EVIDENCE_BYTES` | `26214400` (25 MB) | `26214400` | Application-level hard cap matching Nginx `28M` multipart limit. |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Blank (deterministic DB synthesis) | Optional `openai`, `anthropic`, or `gemini` | Enables optional external LLM synthesis (`live_llm`); leaves deterministic PostgreSQL facts & citations intact when blank. |
| `ENABLE_BACKGROUND_SCHEDULER` | `true` | `true` (or run single scheduler replica) | Enables periodic deduplicated SLA sweep in FastAPI lifespan. |
| `SCHEDULER_INTERVAL_SECONDS` | `900` | `900` (minimum effective `60`) | SLA sweep polling interval in seconds. |
| `RATE_LIMIT_ENABLED` | `true` | `true` | Enables sliding-window in-process throttling on auth, upload, AI, and sweep endpoints. |
| `SENTRY_DSN` | Blank | Optional HTTPS Sentry DSN | Initializes optional error telemetry when `sentry-sdk` is installed. |

> **Important TLS Note:** Because `Settings.validate_production_posture` requires `COOKIE_SECURE=true` when `ENVIRONMENT=production`, browsers will only store/send `Secure` cookies over `https://` (or `http://localhost` in modern Chromium depending on reverse-proxy termination). Terminate TLS in an upstream local reverse proxy (Caddy/Traefik/Nginx HTTPS) pointing to `http://127.0.0.1:${FRONTEND_PORT:-8080}`, OR set `ENVIRONMENT=development` and `COOKIE_SECURE=false` when testing locally over plain HTTP on `127.0.0.1:8080`.

---

## 3. Mode A — Local Development Setup

### 3.1 Start PostgreSQL 16 Container

```powershell
docker compose up -d
```

This creates `companyaudit` (primary dev DB) and `companyaudit_test` (via `backend/scripts/init-test-db.sql`) on `localhost:5433`.

### 3.2 Run Database Migrations & Seed Development Data

```powershell
Set-Location backend
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m app.seeds.seed_data
```

Verify migration head revision:
```powershell
.\.venv\Scripts\alembic.exe current
# Expected: 9a553dc0bf47 (head)
```

### 3.3 Start Backend API & Frontend Dev Server

Terminal 1 (FastAPI):
```powershell
Set-Location backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2 (Vite dev server with `/api` proxy to `127.0.0.1:8000`):
```powershell
npm run dev
```

Access the application at `http://localhost:5173`.

---

## 4. Mode B — Local Production Container Simulation (`docker-compose.prod.yml`)

1. Configure `.env` in the repository root with valid `POSTGRES_PASSWORD`, `JWT_SECRET_KEY` (32+ chars), `CORS_ORIGINS`, and `COOKIE_SECURE`.
2. Validate the Compose manifest schema:
   ```powershell
   docker compose -f docker-compose.prod.yml config -q
   ```
3. Build and launch all 3 services (`db`, `backend`, `frontend`):
   ```powershell
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. `backend/Dockerfile` executes `alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000` automatically on startup as non-root `appuser`.

---

## 5. Healthcheck & Post-Deploy Verification

1. **Database & API Readiness (`/api/health`):**
   ```powershell
   Invoke-RestMethod http://127.0.0.1:8000/api/health
   # Expected: {"status": "ok", "database": "connected", "environment": "..."}
   ```
   Via the Nginx production proxy (`docker-compose.prod.yml`):
   ```powershell
   Invoke-RestMethod http://127.0.0.1:8080/api/health
   ```
2. **Alembic Schema Revision:** Ensure `alembic current` reports `9a553dc0bf47 (head)`.
3. **Audit Trail Hash-Chain Integrity:** Sign in and run `GET /api/history/verify` (or click **Verify Chain Integrity** in **Audit History**) to verify `valid: true` and `genesis_ok: true`.
4. **SLA Scheduler Heartbeat:** Check structured JSON logs (`logger: companyaudit.api`) for clean startup without unhandled exceptions.

