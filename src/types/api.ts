export type RoleLiteral = 'Admin' | 'Auditor' | 'Department Head' | 'Management' | 'Viewer';

export type AuditDomainLiteral =
  | 'Financial'
  | 'HR'
  | 'Technology'
  | 'Project'
  | 'Customer'
  | 'Operations'
  | 'Compliance';

export type AuditStatusLiteral =
  | 'Draft'
  | 'Scheduled'
  | 'In Progress'
  | 'Review'
  | 'Action Required'
  | 'Verification'
  | 'Closed';

export type ResponseValueLiteral = 'Pass' | 'Partial' | 'Fail' | 'N/A';
export type SeverityLiteral = 'Critical' | 'High' | 'Medium' | 'Low';
export type FindingStatusLiteral = 'Open' | 'In Progress' | 'Verification Pending' | 'Overdue' | 'Closed';
export type ActionStatusLiteral = 'Pending' | 'In Progress' | 'Submitted' | 'Verified' | 'Rejected';
export type RiskCategoryLiteral = 'Technology' | 'Financial' | 'Compliance' | 'Operations' | 'Strategic' | 'HR';
export type RiskStatusLiteral = 'Open' | 'Under Treatment' | 'In Review' | 'Mitigated' | 'Accepted';
export type EvidenceStatusLiteral = 'Pending Review' | 'Verified' | 'Flagged';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserSummary {
  id: string;
  company_id: string;
  department_id: string | null;
  department_name: string | null;
  email: string;
  full_name: string;
  initials: string;
  job_title: string | null;
  role: RoleLiteral;
  certifications: string[];
  is_active: boolean;
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: UserSummary;
}

export interface RegisterUserPayload {
  email: string;
  password: string;
  full_name: string;
  job_title?: string | null;
  role: RoleLiteral;
  department_id?: string | null;
  certifications?: string[];
}

export interface UserUpdatePayload {
  full_name?: string;
  job_title?: string | null;
  role?: RoleLiteral;
  department_id?: string | null;
  is_active?: boolean;
  certifications?: string[];
}

export interface AdminResetPasswordPayload {
  new_password: string;
}

export interface CompanyProfileOut {
  id: string;
  legal_name: string;
  ticker: string | null;
  headquarters: string | null;
  fiscal_year_label: string;
  audit_committee_chair: string | null;
  external_auditor: string | null;
  regulatory_scope: string[];
  enterprise_target_score: number;
  minimum_composite_floor: number;
  board_risk_threshold: number;
  digest_frequency: string;
  sla_auto_escalate: boolean;
  ai_citation_strict: boolean;
  sha_lock_enabled?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileUpdate {
  legal_name?: string;
  ticker?: string | null;
  headquarters?: string | null;
  fiscal_year_label?: string;
  audit_committee_chair?: string | null;
  external_auditor?: string | null;
  regulatory_scope?: string[];
  enterprise_target_score?: number;
  minimum_composite_floor?: number;
  board_risk_threshold?: number;
  digest_frequency?: string;
  sla_auto_escalate?: boolean;
  ai_citation_strict?: boolean;
  sha_lock_enabled?: boolean;
}

export interface DepartmentOut {
  id: string;
  company_id: string;
  head_user_id: string | null;
  head_name: string | null;
  code: string;
  name: string;
  target_score: number;
  scoring_weight: number;
  attention_note: string | null;
  score: number | null;
  active_audits: number;
  open_findings: number;
  risk_count: number;
  attention_area: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreate {
  code: string;
  name: string;
  head_user_id?: string | null;
  target_score?: number;
  scoring_weight?: number;
  attention_note?: string | null;
}

export interface DepartmentUpdate {
  name?: string;
  head_user_id?: string | null;
  target_score?: number;
  scoring_weight?: number;
  attention_note?: string | null;
}

export interface AuditScopeOut {
  id: string;
  audit_id: string;
  scope_name: string;
  system_or_process: string;
  regulatory_clause: string | null;
  in_scope: boolean;
}

export interface AuditScopeCreate {
  scope_name: string;
  system_or_process: string;
  regulatory_clause?: string | null;
  in_scope?: boolean;
}

export interface AuditScopeUpdate {
  scope_name?: string;
  system_or_process?: string;
  regulatory_clause?: string | null;
  in_scope?: boolean;
}

export interface AuditStageOut {
  name: string;
  progress: number;
  state: 'completed' | 'active' | 'pending';
}

export interface AuditOut {
  id: string;
  company_id: string;
  department_id: string;
  department_name: string;
  department_code: string;
  lead_auditor_id: string | null;
  lead_auditor_name: string;
  lead_auditor_initials: string;
  lead_auditor_role: string;
  code: string;
  title: string;
  domain: AuditDomainLiteral;
  framework: string;
  status: AuditStatusLiteral;
  computed_score: number | null;
  controls_evaluated: number;
  controls_total: number;
  scheduled_start: string | null;
  target_due_date: string | null;
  completed_at: string | null;
  summary: string | null;
  scopes: AuditScopeOut[];
  stages: AuditStageOut[];
  allowed_next_statuses: AuditStatusLiteral[];
  created_at: string;
  updated_at: string;
}

export interface AuditCreate {
  code?: string;
  title: string;
  domain: AuditDomainLiteral;
  department_id: string;
  lead_auditor_id?: string | null;
  framework: string;
  status?: AuditStatusLiteral;
  scheduled_start?: string | null;
  target_due_date?: string | null;
  summary?: string | null;
  scopes?: AuditScopeCreate[];
}

export interface AuditUpdate {
  title?: string;
  department_id?: string;
  lead_auditor_id?: string | null;
  framework?: string;
  status?: AuditStatusLiteral;
  scheduled_start?: string | null;
  target_due_date?: string | null;
  summary?: string | null;
}

export interface ChecklistCreate {
  code?: string;
  title: string;
  domain: AuditDomainLiteral;
  framework: string;
  version?: string;
}

export interface ChecklistItemCreate {
  control_code: string;
  title: string;
  test_procedure: string;
  weight?: number;
  display_order?: number;
}

export interface ChecklistItemUpdate {
  title?: string;
  test_procedure?: string;
  weight?: number;
  display_order?: number;
}

export interface ChecklistItemOut {
  id: string;
  checklist_id: string;
  checklist_code: string;
  framework: string;
  domain: AuditDomainLiteral;
  control_code: string;
  title: string;
  test_procedure: string;
  weight: number;
  display_order: number;
  latest_response: ResponseValueLiteral | null;
  latest_score_factor: number | null;
  latest_auditor_notes: string | null;
  latest_tested_at: string | null;
  responder_name: string | null;
  evidence_count: number;
}

export interface ChecklistOut {
  id: string;
  company_id: string;
  code: string;
  title: string;
  domain: AuditDomainLiteral;
  framework: string;
  version: string;
  is_active: boolean;
  items: ChecklistItemOut[];
}

export interface AuditResponseOut {
  id: string;
  audit_id: string;
  checklist_item_id: string;
  control_code: string;
  item_title: string;
  responder_user_id: string | null;
  responder_name: string | null;
  response_value: ResponseValueLiteral;
  score_factor: number | null;
  weight: number;
  auditor_notes: string | null;
  tested_at: string;
}

export interface SubmitAuditResponsesResult {
  audit_id: string;
  audit_code: string;
  computed_score: number | null;
  controls_evaluated: number;
  controls_total: number;
  saved_count: number;
  responses: AuditResponseOut[];
}

export interface RecommendationOut {
  id: string;
  finding_id: string;
  risk_id: string | null;
  author_user_id: string | null;
  author_name: string | null;
  title: string;
  guidance: string;
  priority: SeverityLiteral;
  management_response: string | null;
  accepted_by_management: boolean;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorrectiveActionOut {
  id: string;
  company_id: string;
  finding_id: string | null;
  finding_code: string | null;
  finding_title: string | null;
  recommendation_id: string | null;
  risk_id: string | null;
  risk_code: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  verified_by_user_id: string | null;
  verified_by_name: string | null;
  code: string;
  step_order: number;
  title: string;
  detail: string | null;
  status: ActionStatusLiteral;
  progress_percent: number;
  due_date: string;
  completed_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FindingEvidenceRefOut {
  id: string;
  code: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256_hash: string;
  verification_status: EvidenceStatusLiteral;
  tag: string | null;
}

export interface FindingOut {
  id: string;
  company_id: string;
  audit_id: string;
  audit_code: string;
  audit_title: string;
  audit_response_id: string | null;
  department_id: string;
  department_name: string;
  department_code: string;
  owner_user_id: string | null;
  owner_name: string;
  owner_initials: string;
  lead_auditor_id: string | null;
  lead_auditor_name: string;
  signed_off_by_id: string | null;
  signed_off_by_name: string | null;
  code: string;
  title: string;
  root_cause: string;
  workstream: string | null;
  severity: SeverityLiteral;
  status: FindingStatusLiteral;
  target_sla_date: string;
  sla_countdown: string;
  is_overdue: boolean;
  progress_percent: number;
  management_response: string | null;
  rejection_reason?: string | null;
  signed_off_at: string | null;
  recommendations: RecommendationOut[];
  corrective_actions: CorrectiveActionOut[];
  evidence_items: FindingEvidenceRefOut[];
  created_at: string;
  updated_at: string;
}

export interface FindingCreate {
  code?: string;
  audit_id: string;
  department_id: string;
  owner_user_id?: string | null;
  title: string;
  root_cause: string;
  workstream?: string | null;
  severity: SeverityLiteral;
  status?: FindingStatusLiteral;
  target_sla_date: string;
  management_response?: string | null;
}

export interface FindingUpdate {
  title?: string;
  root_cause?: string;
  workstream?: string | null;
  severity?: SeverityLiteral;
  status?: FindingStatusLiteral;
  owner_user_id?: string | null;
  target_sla_date?: string;
  management_response?: string | null;
  rejection_reason?: string | null;
  sign_off?: boolean;
}

export interface RiskFrameworkItem {
  code: string;
  name: string;
  description: string;
}

export interface RiskOut {
  id: string;
  company_id: string;
  department_id: string;
  department_name: string;
  department_code: string;
  owner_user_id: string | null;
  owner_name: string;
  owner_initials: string;
  owner_role: string;
  linked_audit_id: string | null;
  linked_audit_code: string | null;
  code: string;
  title: string;
  scope_description: string;
  category: RiskCategoryLiteral;
  probability: number;
  impact: number;
  inherent_score: number;
  severity: SeverityLiteral;
  residual_probability: number | null;
  residual_impact: number | null;
  residual_score: number;
  residual_level: string;
  mitigation_strategy: string | null;
  narrative: string | null;
  affected_assets: string[];
  mapped_frameworks: RiskFrameworkItem[];
  escalation_target: string | null;
  next_review_date: string | null;
  status: RiskStatusLiteral;
  progress_percent: number;
  corrective_actions: CorrectiveActionOut[];
  created_at: string;
  updated_at: string;
}

export interface RiskCreate {
  code?: string;
  department_id: string;
  owner_user_id?: string | null;
  linked_audit_id?: string | null;
  title: string;
  scope_description: string;
  category: RiskCategoryLiteral;
  probability: number;
  impact: number;
  residual_probability?: number | null;
  residual_impact?: number | null;
  mitigation_strategy?: string | null;
  narrative?: string | null;
  affected_assets?: string[];
  mapped_frameworks?: RiskFrameworkItem[];
  escalation_target?: string | null;
  next_review_date?: string | null;
  status?: RiskStatusLiteral;
}

export interface RiskUpdate {
  title?: string;
  scope_description?: string;
  category?: RiskCategoryLiteral;
  probability?: number;
  impact?: number;
  residual_probability?: number | null;
  residual_impact?: number | null;
  mitigation_strategy?: string | null;
  narrative?: string | null;
  affected_assets?: string[];
  escalation_target?: string | null;
  next_review_date?: string | null;
  status?: RiskStatusLiteral;
}

export interface EvidenceOut {
  id: string;
  company_id: string;
  audit_id: string | null;
  audit_code: string | null;
  department_name: string | null;
  finding_id: string | null;
  finding_code: string | null;
  corrective_action_id: string | null;
  checklist_item_id: string | null;
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  code: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256_hash: string;
  verification_status: EvidenceStatusLiteral;
  tag: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceUpdate {
  audit_id?: string | null;
  finding_id?: string | null;
  corrective_action_id?: string | null;
  checklist_item_id?: string | null;
  tag?: string | null;
}

export interface RiskEscalateRequest {
  escalation_target?: string | null;
  note?: string | null;
}

export interface DistributionRuleOut {
  id: string;
  company_id: string;
  name: string;
  schedule_label: string;
  recipients: string;
  report_suite_id: string;
  export_format: 'pdf' | 'xlsx' | 'csv';
  icon: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DistributionRuleCreate {
  name: string;
  schedule_label: string;
  recipients: string;
  report_suite_id?: string;
  export_format?: 'pdf' | 'xlsx' | 'csv';
  icon?: string;
  is_active?: boolean;
}

export interface DistributionRuleUpdate {
  name?: string;
  schedule_label?: string;
  recipients?: string;
  report_suite_id?: string;
  export_format?: 'pdf' | 'xlsx' | 'csv';
  is_active?: boolean;
}

export interface PerformanceTrendPoint {
  month: string;
  actual: number;
  target: number;
  baseline: number;
  predicted?: number | null;
  audited_controls_count?: number;
}

export interface ForecastSummary {
  slope_per_month: number;
  intercept: number;
  r_squared: number;
  current_score: number;
  target_score: number;
  projected_next_month: number;
  predicted_months_to_target: number | null;
  predicted_days_ahead_or_behind: number;
  confidence_label: string;
  data_points_count?: number;
  is_sufficient_for_forecast?: boolean;
  methodology_note?: string;
}

export interface FrameworkComplianceOut {
  framework: string;
  controls_total: number;
  controls_evaluated: number;
  score: number;
  status: 'Compliant' | 'Monitor' | 'Needs Attention' | 'Not Evaluated';
}

export interface EvidenceBreakdownOut {
  total: number;
  verified: number;
  pending_review: number;
  flagged: number;
}

export interface RiskMatrixCell {
  probability: number;
  impact: number;
  score: number;
  severity: SeverityLiteral;
  count: number;
  risk_codes: string[];
}

export interface RiskDistributionOut {
  total_risks: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  matrix: RiskMatrixCell[];
}

export interface DashboardOverviewOut {
  company_name: string;
  fiscal_year: string;
  period: string;
  composite_score: number;
  enterprise_target: number;
  minimum_floor: number;
  active_audits_count: number;
  completed_audits_count: number;
  total_audits_count: number;
  audit_completion_rate_pct?: number;
  open_findings_count: number;
  critical_findings_count: number;
  overdue_findings_count: number;
  overdue_actions_count?: number;
  critical_high_risks_count: number;
  board_risk_threshold: number;
  sla_compliance_pct: number;
  performance_trend: PerformanceTrendPoint[];
  forecast: ForecastSummary;
  departments: DepartmentOut[];
  priority_signoffs: FindingOut[];
  risk_distribution: RiskDistributionOut;
  framework_compliance?: FrameworkComplianceOut[];
  evidence_breakdown?: EvidenceBreakdownOut;
  kpi_methodology?: Record<string, string>;
}

export interface NotificationOut {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  is_read: boolean;
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  target_link: string | null;
  created_at: string;
}

export interface AuditHistoryOut {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  actor_label: string;
  actor_role: string;
  category: string;
  module: string;
  entity_type: string;
  entity_id: string;
  entity_ref: string;
  action: string;
  changes_json: Record<string, unknown>;
  ip_address: string | null;
  prev_event_sha256?: string | null;
  event_sha256: string;
  created_at: string;
}

export interface AuditHistoryVerifyOut {
  valid: boolean;
  total_events: number;
  checked_events: number;
  broken_event_ids: string[];
  genesis_ok: boolean;
  latest_event_sha256: string | null;
  verified_at: string;
  verification_note: string;
}

export interface SlaSweepResultOut {
  notifications_created: number;
  overdue_audits: number;
  overdue_actions: number;
  upcoming_deadlines: number;
  critical_risks: number;
  ran_at: string;
}

export interface ReportSuiteOut {
  id: string;
  title: string;
  description: string;
  updated_at: string;
  on_demand: boolean;
  tags: string[];
  format_tag: string;
  icon: 'building' | 'shield' | 'grid' | 'alarm' | 'domain' | 'brain';
  primary_action: string;
  secondary_action: string;
}

export interface ReportSectionOut {
  heading: string;
  metrics?: { label: string; value: string }[];
  items?: {
    code: string;
    name: string;
    score: number | null;
    target: number;
    open_findings: number;
    note: string | null;
  }[];
}

export interface ReportDetailOut {
  id: string;
  title: string;
  generated_at: string;
  company_name: string;
  fiscal_year: string;
  executive_summary: string;
  kpis: Record<string, string | number | null>;
  sections: ReportSectionOut[];
  csv_headers: string[];
  csv_rows: (string | number)[][];
}

export interface AiCitation {
  entity_type: string;
  entity_ref: string;
  label: string;
  route: string;
}

export interface AiSynthesisResponse {
  answer: string;
  verified_facts?: string[];
  recommendations?: string[];
  provider_status?: 'unavailable' | 'configured' | 'live_llm';
  provider_name?: string;
  provider_message?: string;
  scoped_department?: string | null;
  citations: AiCitation[];
  metrics_snapshot: Record<string, unknown>;
  generated_at: string;
}

export interface SearchResultItem {
  entity_type: string;
  entity_id: string;
  code: string;
  title: string;
  subtitle: string;
  status: string;
  route: string;
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
}

export interface FinancialMetricOut {
  id: string;
  department_id: string | null;
  fiscal_period: string;
  metric_code: string;
  metric_name: string;
  currency: string;
  reported_amount: number;
  budget_amount: number | null;
  variance_pct: number | null;
  sox_control_verified: boolean;
  recorded_at: string;
}

export interface EmployeeComplianceOut {
  id: string;
  department_id: string;
  department_name: string;
  employee_code: string;
  full_name: string;
  role_title: string | null;
  background_check_verified: boolean;
  security_training_completed: boolean;
  training_completed_at: string | null;
  employment_status: string;
  hired_at: string | null;
}

export interface ProjectTaskOut {
  id: string;
  project_id: string;
  title: string;
  stage_gate: string | null;
  status: string;
  due_date: string | null;
  sla_breached: boolean;
}

export interface ProjectOut {
  id: string;
  department_id: string;
  department_name: string;
  code: string;
  name: string;
  budget_amount: number;
  actual_spend: number;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  tasks: ProjectTaskOut[];
}

export interface CustomerAssuranceOut {
  id: string;
  account_code: string;
  organization_name: string;
  region: string;
  tier: string;
  dpa_signed: boolean;
  dsar_requests_open: number;
  sla_compliance_pct: number;
  satisfaction_score: number | null;
}

export interface DomainTelemetryOut {
  domain: string;
  summary_kpis: Record<string, string | number>;
  financial_metrics: FinancialMetricOut[];
  employees: EmployeeComplianceOut[];
  projects: ProjectOut[];
  customers: CustomerAssuranceOut[];
}
