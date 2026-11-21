-- Flyway Migration V2: Phase 4 Security, Notifications & Cryptographic History
-- Corresponding to Alembic Revision: 9a553dc0bf47

-- 19. distribution_rules
CREATE TABLE IF NOT EXISTS distribution_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(160) NOT NULL,
    schedule_label VARCHAR(120) NOT NULL,
    recipients VARCHAR(255) NOT NULL,
    report_suite_id VARCHAR(64) NOT NULL DEFAULT 'rep-board',
    export_format VARCHAR(16) NOT NULL DEFAULT 'pdf',
    icon VARCHAR(16) NOT NULL DEFAULT 'calendar',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_distribution_rules_format CHECK (export_format IN ('pdf', 'xlsx', 'csv'))
);
CREATE INDEX IF NOT EXISTS ix_distribution_rules_company ON distribution_rules (company_id);

-- 20. refresh_sessions
CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_family UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by_id UUID REFERENCES refresh_sessions(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_refresh_sessions_user ON refresh_sessions (company_id, user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_sessions_family ON refresh_sessions (company_id, token_family);

-- 21. notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    entity_type VARCHAR(48),
    entity_id UUID,
    target_link VARCHAR(255),
    dedup_key VARCHAR(160),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_notifications_severity CHECK (severity IN ('critical', 'warning', 'info'))
);
CREATE INDEX IF NOT EXISTS ix_notifications_user_unread ON notifications (company_id, user_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup_key ON notifications (company_id, user_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- 22. audit_history (Cryptographically Chained Append-Only Ledger)
CREATE TABLE IF NOT EXISTS audit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_label VARCHAR(150) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    module VARCHAR(64) NOT NULL,
    entity_type VARCHAR(48) NOT NULL,
    entity_id UUID NOT NULL,
    entity_ref VARCHAR(48) NOT NULL,
    action TEXT NOT NULL,
    changes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    prev_event_sha256 VARCHAR(64),
    event_sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_audit_history_category CHECK (category IN ('Sign-Off', 'Control Test', 'Risk Escalation', 'Evidence', 'System', 'Auth', 'Mutation')),
    CONSTRAINT ck_audit_history_sha256 CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_audit_history_prev_sha256 CHECK (prev_event_sha256 IS NULL OR prev_event_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS ix_audit_history_company_time ON audit_history (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_history_entity ON audit_history (company_id, entity_type, entity_id);

-- Add Enterprise SHA lock toggle to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sha_lock_enabled BOOLEAN NOT NULL DEFAULT TRUE;
