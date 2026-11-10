# CompanyAudit — Database Backup & Disaster Recovery Runbook

**Supported Engine:** PostgreSQL 16 (`pg_dump` / `pg_restore` custom compressed format `-Fc`)  
**Backup Verification:** Mandatory SHA-256 checksum sidecar (`.dump.sha256`)  
**Companion Assets:** Evidence Vault filesystem (`EVIDENCE_STORAGE_DIR` / `companyaudit_prod_evidence`)

---

## 1. Recovery Strategy & Consistency Notes

CompanyAudit persists relational audit records in PostgreSQL and binary evidence files in an out-of-webroot vault keyed by `<company_id>/<uuid><ext>` (stored in the `evidence.storage_key` and `evidence.sha256_hash` columns).  
To ensure zero orphaned evidence pointers during disaster recovery:
1. Capture backups on a synchronized maintenance schedule (database dump **plus** snapshot of the evidence storage directory).
2. Always retain both `<backup>.dump` and `<backup>.dump.sha256`.
3. Never store `.dump` backups in version control (enforced by `.gitignore` via `backend/backups/`, `*.dump`, and `*.dump.sha256`).

---

## 2. Backup Scripts (`backup_db.ps1` / `backup_db.sh`)

Both scripts auto-detect a local `pg_dump` binary and fall back automatically to `docker exec <ContainerName> pg_dump` when host PostgreSQL client utilities are absent (or when `-UseDockerExec` / `USE_DOCKER_EXEC=true` is specified).

### 2.1 Windows PowerShell (`backend/scripts/backup_db.ps1`)

```powershell
# Default dev database (container: companyaudit-postgres, db: companyaudit, port: 5433)
.\backend\scripts\backup_db.ps1

# Explicit database or Docker prod container example
.\backend\scripts\backup_db.ps1 `
  -ContainerName "companyaudit-prod-db" `
  -Database "companyaudit" `
  -DbUser "companyaudit" `
  -UseDockerExec
```

**Output Generated in `backend/backups/`:**
- `<Database>_<YYYYMMDD_HHMMSS>.dump` (PostgreSQL `-Fc --no-owner --no-privileges` archive)
- `<Database>_<YYYYMMDD_HHMMSS>.dump.sha256` (lowercase hexadecimal SHA-256 digest + filename)

### 2.2 Linux / macOS Bash (`backend/scripts/backup_db.sh`)

```bash
chmod +x backend/scripts/backup_db.sh
./backend/scripts/backup_db.sh companyaudit

# Force execution inside production Docker DB container
USE_DOCKER_EXEC=true CONTAINER_NAME=companyaudit-prod-db ./backend/scripts/backup_db.sh companyaudit
```

---

## 3. Restore Scripts (`restore_db.ps1` / `restore_db.sh`)

Before modifying the target database, both scripts automatically:
1. Locate `${BackupPath}.sha256`. If present, recompute the SHA-256 checksum of the `.dump` file and **abort on any mismatch** (`SHA-256 verification failed`).
2. Require interactive `RESTORE` confirmation unless `-Force` (`PowerShell`) or `FORCE_RESTORE=true` (`Bash`) is explicitly passed.
3. Restore schema objects and data cleanly using `pg_restore --clean --if-exists --no-owner --no-privileges`.

### 3.1 Windows PowerShell (`backend/scripts/restore_db.ps1`)

```powershell
# Interactive prompt confirmation
.\backend\scripts\restore_db.ps1 -BackupPath .\backend\backups\companyaudit_20261110_120000.dump

# Non-interactive restore into isolated test/drill DB
.\backend\scripts\restore_db.ps1 `
  -BackupPath .\backend\backups\companyaudit_20261110_120000.dump `
  -Database companyaudit_test `
  -Force
```

### 3.2 Linux / macOS Bash (`backend/scripts/restore_db.sh`)

```bash
chmod +x backend/scripts/restore_db.sh
./backend/scripts/restore_db.sh ./backend/backups/companyaudit_20261110_120000.dump companyaudit_test

# Automated non-interactive restore into Docker container
FORCE_RESTORE=true USE_DOCKER_EXEC=true CONTAINER_NAME=companyaudit-prod-db \
  ./backend/scripts/restore_db.sh ./backend/backups/companyaudit_20261110_120000.dump companyaudit
```

---

## 4. Backing Up & Restoring the Evidence Vault

PostgreSQL metadata references files stored under `EVIDENCE_STORAGE_DIR`:

- **Local Development (`./backend/storage/evidence`):**
  ```powershell
  Compress-Archive -Path .\backend\storage\evidence -DestinationPath .\backend\backups\evidence_$(Get-Date -Format yyyyMMdd_HHmmss).zip
  ```
- **Docker Production Volume (`companyaudit_prod_evidence`):**
  ```bash
  docker run --rm \
    -v companyaudit_prod_evidence:/source:ro \
    -v "$(pwd)/backend/backups:/backup" \
    alpine tar czf "/backup/evidence_$(date +%Y%m%d_%H%M%S).tar.gz" -C /source .
  ```

After restoring both PostgreSQL and the evidence directory, verify integrity across all artifacts:
1. Run `alembic current` (must match `9a553dc0bf47` or latest applied head).
2. Run `GET /api/history/verify` to confirm all restored `audit_history` rows validate cleanly along the SHA-256 chain.
3. Open **Evidence Vault** (`/audits/evidence`) and click **Verify Checksum** on key artifacts (`PUT /api/evidence/{id}/verify`) to confirm disk bytes match PostgreSQL `sha256_hash` values.

---

## 5. Quarterly Disaster Recovery Drill Procedure

1. Take a live backup of the primary DB using `backup_db.ps1` / `backup_db.sh`.
2. Restore the dump strictly into the isolated `companyaudit_test` database (or a temporary PostgreSQL container) with `--Database companyaudit_test -Force` so production/dev state is untouched.
3. Verify schema + row counts and cryptographic audit ledger integrity:
   ```powershell
   docker exec companyaudit-postgres psql -U companyaudit -d companyaudit_test -c "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS audits FROM audits; SELECT COUNT(*) AS history_events FROM audit_history;"
   ```
4. Reset `companyaudit_test` afterwards if needed (`pytest` cleanly manages its own test fixtures on `TEST_DATABASE_URL`).

