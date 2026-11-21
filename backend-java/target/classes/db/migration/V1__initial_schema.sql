-- Flyway Migration V1: Initial Enterprise Schema
-- Corresponding to Alembic Revision: d72d5d8ca631

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. companies
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    ticker VARCHAR(32),
    headquarters VARCHAR(255),
    fiscal_year_label VARCHAR(64) NOT NULL DEFAULT 'FY 2025 (Q4 Active)',
    audit_committee_chair VARCHAR(150),
    external_auditor VARCHAR(150),
    regulatory_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    enterprise_target_score NUMERIC(5, 2) NOT NULL DEFAULT 85.00,
    minimum_composite_floor NUMERIC(5, 2) NOT NULL DEFAULT 80.00,
    board_risk_threshold SMALLINT NOT NULL DEFAULT 5,
    digest_frequency VARCHAR(64) NOT NULL DEFAULT 'Weekly — Mondays 08:00 EST',
    sla_auto_escalate BOOLEAN NOT NULL DEFAULT TRUE,
    ai_citation_strict BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_companies_target_score_range CHECK (enterprise_target_score >= 0 AND enterprise_target_score <= 100),
    CONSTRAINT ck_companies_min_floor_range CHECK (minimum_composite_floor >= 0 AND minimum_composite_floor <= 100),
    CONSTRAINT ck_companies_risk_threshold_pos CHECK (board_risk_threshold >= 1)
);

-- 2. departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    head_user_id UUID,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    target_score NUMERIC(5, 2) NOT NULL DEFAULT 85.00,
    scoring_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.1250,
    attention_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_departments_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_departments_target_score CHECK (target_score >= 0 AND target_score <= 100),
    CONSTRAINT ck_departments_weight CHECK (scoring_weight > 0 AND scoring_weight <= 1)
);
CREATE INDEX IF NOT EXISTS ix_departments_company ON departments(company_id);

-- 3. users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    job_title VARCHAR(120),
    role VARCHAR(32) NOT NULL,
    certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_users_valid_role CHECK (role IN ('Admin', 'Auditor', 'Department Head', 'Management', 'Viewer'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_company_lower_email ON users (company_id, LOWER(email));
CREATE INDEX IF NOT EXISTS ix_users_company_role ON users (company_id, role);

-- Circular FK for departments.head_user_id
ALTER TABLE departments ADD CONSTRAINT fk_departments_head_user_id FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 4. audits
CREATE TABLE IF NOT EXISTS audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    lead_auditor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    domain VARCHAR(32) NOT NULL,
    framework VARCHAR(150) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Draft',
    computed_score NUMERIC(5, 2),
    scheduled_start DATE,
    target_due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_audits_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_audits_valid_domain CHECK (domain IN ('Financial', 'HR', 'Technology', 'Project', 'Customer', 'Operations', 'Compliance')),
    CONSTRAINT ck_audits_valid_status CHECK (status IN ('Draft', 'Scheduled', 'In Progress', 'Review', 'Action Required', 'Verification', 'Closed')),
    CONSTRAINT ck_audits_score_range CHECK (computed_score IS NULL OR (computed_score >= 0 AND computed_score <= 100))
);
CREATE INDEX IF NOT EXISTS ix_audits_company_domain_status ON audits (company_id, domain, status);
CREATE INDEX IF NOT EXISTS ix_audits_lead ON audits (company_id, lead_auditor_id);

-- 5. audit_scopes
CREATE TABLE IF NOT EXISTS audit_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    scope_name VARCHAR(180) NOT NULL,
    system_or_process VARCHAR(180) NOT NULL,
    regulatory_clause VARCHAR(120),
    in_scope BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_scopes_audit ON audit_scopes (company_id, audit_id);

-- 6. checklists
CREATE TABLE IF NOT EXISTS checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    title VARCHAR(200) NOT NULL,
    domain VARCHAR(32) NOT NULL,
    framework VARCHAR(120) NOT NULL,
    version VARCHAR(24) NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checklists_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_checklists_valid_domain CHECK (domain IN ('Financial', 'HR', 'Technology', 'Project', 'Customer', 'Operations', 'Compliance'))
);

-- 7. checklist_items
CREATE TABLE IF NOT EXISTS checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    control_code VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    test_procedure TEXT NOT NULL,
    weight NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checklist_items_code UNIQUE (checklist_id, control_code),
    CONSTRAINT ck_checklist_items_weight_pos CHECK (weight > 0),
    CONSTRAINT ck_checklist_items_order_pos CHECK (display_order >= 1)
);
CREATE INDEX IF NOT EXISTS ix_checklist_items_checklist ON checklist_items (company_id, checklist_id);

-- 8. audit_responses
CREATE TABLE IF NOT EXISTS audit_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    checklist_item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE RESTRICT,
    responder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    response_value VARCHAR(16) NOT NULL,
    score_factor NUMERIC(3, 2),
    auditor_notes TEXT,
    tested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_audit_responses_audit_item UNIQUE (audit_id, checklist_item_id),
    CONSTRAINT ck_audit_responses_value CHECK (response_value IN ('Pass', 'Partial', 'Fail', 'N/A')),
    CONSTRAINT ck_audit_responses_factor CHECK (score_factor IS NULL OR score_factor IN (0.00, 0.50, 1.00))
);
CREATE INDEX IF NOT EXISTS ix_audit_responses_audit ON audit_responses (company_id, audit_id);

-- 9. findings
CREATE TABLE IF NOT EXISTS findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    audit_response_id UUID REFERENCES audit_responses(id) ON DELETE SET NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    lead_auditor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    signed_off_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    root_cause TEXT NOT NULL,
    workstream VARCHAR(120),
    severity VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Open',
    target_sla_date DATE NOT NULL,
    management_response TEXT,
    rejection_reason TEXT,
    signed_off_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_findings_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_findings_severity CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
    CONSTRAINT ck_findings_status CHECK (status IN ('Open', 'In Progress', 'Verification Pending', 'Overdue', 'Closed'))
);
CREATE INDEX IF NOT EXISTS ix_findings_company_status_sev ON findings (company_id, status, severity);
CREATE INDEX IF NOT EXISTS ix_findings_company_dept_status ON findings (company_id, department_id, status);
CREATE INDEX IF NOT EXISTS ix_findings_sla ON findings (company_id, target_sla_date);

-- 10. risks
CREATE TABLE IF NOT EXISTS risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    linked_audit_id UUID REFERENCES audits(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    scope_description TEXT NOT NULL,
    category VARCHAR(32) NOT NULL,
    probability SMALLINT NOT NULL,
    impact SMALLINT NOT NULL,
    inherent_score SMALLINT GENERATED ALWAYS AS (probability * impact) STORED,
    severity VARCHAR(16) NOT NULL,
    residual_probability SMALLINT,
    residual_impact SMALLINT,
    mitigation_strategy TEXT,
    narrative TEXT,
    affected_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
    mapped_frameworks JSONB NOT NULL DEFAULT '[]'::jsonb,
    escalation_target VARCHAR(120),
    next_review_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_risks_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_risks_category CHECK (category IN ('Technology', 'Financial', 'Compliance', 'Operations', 'Strategic', 'HR')),
    CONSTRAINT ck_risks_probability_range CHECK (probability BETWEEN 1 AND 5),
    CONSTRAINT ck_risks_impact_range CHECK (impact BETWEEN 1 AND 5),
    CONSTRAINT ck_risks_res_prob_range CHECK (residual_probability IS NULL OR (residual_probability BETWEEN 1 AND 5)),
    CONSTRAINT ck_risks_res_imp_range CHECK (residual_impact IS NULL OR (residual_impact BETWEEN 1 AND 5)),
    CONSTRAINT ck_risks_severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT ck_risks_status CHECK (status IN ('Open', 'Under Treatment', 'In Review', 'Mitigated', 'Accepted'))
);
CREATE INDEX IF NOT EXISTS ix_risks_matrix ON risks (company_id, probability, impact);
CREATE INDEX IF NOT EXISTS ix_risks_severity ON risks (company_id, severity, status);

-- 11. recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    risk_id UUID REFERENCES risks(id) ON DELETE SET NULL,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    guidance TEXT NOT NULL,
    priority VARCHAR(16) NOT NULL,
    management_response TEXT,
    accepted_by_management BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_recommendations_priority CHECK (priority IN ('Critical', 'High', 'Medium', 'Low'))
);
CREATE INDEX IF NOT EXISTS ix_recommendations_finding ON recommendations (company_id, finding_id);

-- 12. corrective_actions
CREATE TABLE IF NOT EXISTS corrective_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    finding_id UUID REFERENCES findings(id) ON DELETE CASCADE,
    recommendation_id UUID REFERENCES recommendations(id) ON DELETE SET NULL,
    risk_id UUID REFERENCES risks(id) ON DELETE SET NULL,
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    step_order INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    detail TEXT,
    status VARCHAR(24) NOT NULL DEFAULT 'Pending',
    progress_percent SMALLINT NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_corrective_actions_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_corrective_actions_parent_required CHECK (finding_id IS NOT NULL OR risk_id IS NOT NULL),
    CONSTRAINT ck_corrective_actions_step_pos CHECK (step_order >= 1),
    CONSTRAINT ck_corrective_actions_status CHECK (status IN ('Pending', 'In Progress', 'Submitted', 'Verified', 'Rejected')),
    CONSTRAINT ck_corrective_actions_progress_range CHECK (progress_percent BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_actions_assignee_due ON corrective_actions (company_id, assigned_to_user_id, due_date);

-- 13. evidence
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    audit_id UUID REFERENCES audits(id) ON DELETE SET NULL,
    finding_id UUID REFERENCES findings(id) ON DELETE SET NULL,
    corrective_action_id UUID REFERENCES corrective_actions(id) ON DELETE SET NULL,
    checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE SET NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL UNIQUE,
    mime_type VARCHAR(120) NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    verification_status VARCHAR(24) NOT NULL DEFAULT 'Pending Review',
    tag VARCHAR(80),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_evidence_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_evidence_size_cap CHECK (byte_size > 0 AND byte_size <= 26214400),
    CONSTRAINT ck_evidence_sha256_hex CHECK (sha256_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_evidence_status CHECK (verification_status IN ('Pending Review', 'Verified', 'Flagged'))
);
CREATE INDEX IF NOT EXISTS ix_evidence_audit_finding ON evidence (company_id, audit_id, finding_id);
CREATE INDEX IF NOT EXISTS ix_evidence_company_status ON evidence (company_id, verification_status);

-- 14. projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(200) NOT NULL,
    budget_amount NUMERIC(16, 2) NOT NULL DEFAULT 0,
    actual_spend NUMERIC(16, 2) NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'Active',
    start_date DATE,
    target_end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_projects_company_code UNIQUE (company_id, code),
    CONSTRAINT ck_projects_budget_nonneg CHECK (budget_amount >= 0),
    CONSTRAINT ck_projects_spend_nonneg CHECK (actual_spend >= 0),
    CONSTRAINT ck_projects_status CHECK (status IN ('Planned', 'Active', 'At Risk', 'Completed', 'On Hold'))
);

-- 15. project_tasks
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    stage_gate VARCHAR(64),
    status VARCHAR(24) NOT NULL DEFAULT 'Todo',
    due_date DATE,
    sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_project_tasks_status CHECK (status IN ('Todo', 'In Progress', 'Blocked', 'Done'))
);
CREATE INDEX IF NOT EXISTS ix_project_tasks_project ON project_tasks (company_id, project_id, status);

-- 16. employees
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    employee_code VARCHAR(32) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role_title VARCHAR(120),
    background_check_verified BOOLEAN NOT NULL DEFAULT FALSE,
    security_training_completed BOOLEAN NOT NULL DEFAULT FALSE,
    training_completed_at DATE,
    employment_status VARCHAR(24) NOT NULL DEFAULT 'Active',
    hired_at DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employees_company_code UNIQUE (company_id, employee_code),
    CONSTRAINT ck_employees_status CHECK (employment_status IN ('Active', 'On Leave', 'Terminated'))
);
CREATE INDEX IF NOT EXISTS ix_employees_compliance ON employees (company_id, department_id, security_training_completed);

-- 17. customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    account_code VARCHAR(32) NOT NULL,
    organization_name VARCHAR(200) NOT NULL,
    region VARCHAR(64) NOT NULL,
    tier VARCHAR(32) NOT NULL DEFAULT 'Enterprise',
    dpa_signed BOOLEAN NOT NULL DEFAULT FALSE,
    dsar_requests_open INTEGER NOT NULL DEFAULT 0,
    sla_compliance_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    satisfaction_score NUMERIC(4, 2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_company_code UNIQUE (company_id, account_code),
    CONSTRAINT ck_customers_tier CHECK (tier IN ('Enterprise', 'Mid-Market', 'Strategic')),
    CONSTRAINT ck_customers_dsar_nonneg CHECK (dsar_requests_open >= 0),
    CONSTRAINT ck_customers_sla_range CHECK (sla_compliance_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_customers_csat_range CHECK (satisfaction_score IS NULL OR (satisfaction_score BETWEEN 0 AND 10))
);

-- 18. financial_metrics
CREATE TABLE IF NOT EXISTS financial_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    fiscal_period VARCHAR(32) NOT NULL,
    metric_code VARCHAR(40) NOT NULL,
    metric_name VARCHAR(150) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    reported_amount NUMERIC(16, 2) NOT NULL,
    budget_amount NUMERIC(16, 2),
    variance_pct NUMERIC(7, 4),
    sox_control_verified BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fin_metrics_period_code UNIQUE (company_id, fiscal_period, metric_code)
);
CREATE INDEX IF NOT EXISTS ix_fin_metrics_period ON financial_metrics (company_id, fiscal_period);
