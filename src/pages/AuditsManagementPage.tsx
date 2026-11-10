import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Columns3,
  Download,
  Lock,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AuditWorkspaceNav } from '../components/layout/AuditWorkspaceNav';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar } from '../components/ui/FilterToolbar';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { BadgeTone } from '../styles/designTokens';
import {
  AuditDomainLiteral,
  AuditOut,
  AuditScopeOut,
  AuditStageOut,
  AuditStatusLiteral,
  DepartmentOut,
  DomainTelemetryOut,
  PaginatedResponse,
} from '../types/api';
import { AuditDomain, AuditEngagement } from '../types/audit';

interface AuditsManagementPageProps {
  domainFilter?: AuditDomain;
  onNotify: (msg: string) => void;
}

const DOMAIN_PILLS: { label: string; to: string; domain?: AuditDomain }[] = [
  { label: 'All Domains', to: '/audits' },
  { label: 'Financial', to: '/audits/financial', domain: 'Financial' },
  { label: 'HR', to: '/audits/hr', domain: 'HR' },
  { label: 'Technology', to: '/audits/technology', domain: 'Technology' },
  { label: 'Project', to: '/audits/project', domain: 'Project' },
  { label: 'Customer', to: '/audits/customer', domain: 'Customer' },
  { label: 'Operations', to: '/audits/operations', domain: 'Operations' },
];

const API_STATUS_OPTIONS: AuditStatusLiteral[] = [
  'Draft',
  'Scheduled',
  'In Progress',
  'Review',
  'Action Required',
  'Verification',
  'Closed',
];

interface UnifiedEngagementRow {
  id: string;
  code: string;
  title: string;
  domain: AuditDomainLiteral;
  framework: string;
  departmentId: string;
  businessUnit: string;
  leadAuditor: string;
  leadInitials: string;
  leadRole: string;
  targetDue: string;
  targetDueRaw: string;
  score: number | null;
  status: string;
  controlsEvaluated: number;
  controlsTotal: number;
  summary: string;
  scopes: AuditScopeOut[];
  stages: AuditStageOut[];
  allowedNextStatuses: AuditStatusLiteral[];
}

function getAuditStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'In Progress':
      return 'secondary';
    case 'Review':
    case 'Under Review':
      return 'info';
    case 'Verification':
      return 'primary';
    case 'Action Required':
      return 'danger';
    case 'Closed':
    case 'Completed':
      return 'success';
    default:
      return 'neutral';
  }
}

export const AuditsManagementPage: React.FC<AuditsManagementPageProps> = ({ domainFilter, onNotify }) => {
  const navigate = useNavigate();
  const { mode, hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Live API State
  const [apiAudits, setApiAudits] = useState<AuditOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [telemetry, setTelemetry] = useState<DomainTelemetryOut | null>(null);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Demo Mode fallback state
  const [demoEngagements, setDemoEngagements] = useState<AuditEngagement[]>(() =>
    auditService.getEngagements()
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showFrameworkCol, setShowFrameworkCol] = useState(true);
  const [spotlightExpanded, setSpotlightExpanded] = useState(true);
  const [initiateModalOpen, setInitiateModalOpen] = useState(() => searchParams.get('initiate') === '1');
  const [transitionAudit, setTransitionAudit] = useState<UnifiedEngagementRow | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Edit Audit & Scopes CRUD modal state
  const [manageAuditId, setManageAuditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editFramework, setEditFramework] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [savingManage, setSavingManage] = useState(false);
  const [newScopeName, setNewScopeName] = useState('');
  const [newScopeSystem, setNewScopeSystem] = useState('');
  const [newScopeClause, setNewScopeClause] = useState('');
  const [newScopeInScope, setNewScopeInScope] = useState(true);
  const [scopeSaving, setScopeSaving] = useState(false);

  // Modal fields
  const [newAuditTitle, setNewAuditTitle] = useState('');
  const [newAuditDomain, setNewAuditDomain] = useState<AuditDomainLiteral>(domainFilter ?? 'Technology');
  const [newAuditFramework, setNewAuditFramework] = useState('SOC 2 Type II / ISO 27001');
  const [newAuditDeptId, setNewAuditDeptId] = useState('');
  const [newAuditUnit, setNewAuditUnit] = useState('Cloud Operations & SecOps');
  const [newAuditDueDate, setNewAuditDueDate] = useState('2026-01-31');
  const [creating, setCreating] = useState(false);

  const canMutate = hasRole('Admin', 'Auditor');

  useEffect(() => {
    if (domainFilter) setNewAuditDomain(domainFilter);
  }, [domainFilter]);

  const fetchData = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (domainFilter) qs.set('domain', domainFilter);

      const requests: [
        Promise<PaginatedResponse<AuditOut>>,
        Promise<DepartmentOut[]>,
        Promise<DomainTelemetryOut | null>,
      ] = [
        apiClient.get<PaginatedResponse<AuditOut>>(`/audits?${qs.toString()}`),
        apiClient.get<DepartmentOut[]>('/departments'),
        domainFilter
          ? apiClient.get<DomainTelemetryOut>(`/domains/${encodeURIComponent(domainFilter)}/telemetry`)
          : Promise.resolve(null),
      ];

      const [auditsRes, deptsRes, telemRes] = await Promise.all(requests);
      setApiAudits(auditsRes.items);
      setDepartments(deptsRes);
      setTelemetry(telemRes);
      setNewAuditDeptId((prev) => prev || (deptsRes[0]?.id ?? ''));
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load audit engagements.');
    } finally {
      setLoading(false);
    }
  }, [mode, domainFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const unifiedRows: UnifiedEngagementRow[] = useMemo(() => {
    if (mode === 'api') {
      return apiAudits.map((a) => ({
        id: a.id,
        code: a.code,
        title: a.title,
        domain: a.domain,
        framework: a.framework,
        departmentId: a.department_id,
        businessUnit: a.department_name,
        leadAuditor: a.lead_auditor_name,
        leadInitials: a.lead_auditor_initials,
        leadRole: a.lead_auditor_role,
        targetDue: a.target_due_date || 'TBD',
        targetDueRaw: a.target_due_date || '',
        score: a.computed_score,
        status: a.status,
        controlsEvaluated: a.controls_evaluated,
        controlsTotal: a.controls_total,
        summary: a.summary || `${a.domain} engagement mapped to ${a.framework}.`,
        scopes: a.scopes || [],
        stages: a.stages,
        allowedNextStatuses: a.allowed_next_statuses,
      }));
    }

    const subset = domainFilter ? demoEngagements.filter((e) => e.domain === domainFilter) : demoEngagements;
    return subset.map((e) => ({
      id: e.id,
      code: e.code,
      title: e.title,
      domain: e.domain,
      framework: e.framework,
      departmentId: '',
      businessUnit: e.businessUnit,
      leadAuditor: e.leadAuditor,
      leadInitials: e.leadInitials,
      leadRole: e.leadRole,
      targetDue: e.targetDue,
      targetDueRaw: '',
      score: e.score,
      status: e.status,
      controlsEvaluated: e.controlsEvaluated,
      controlsTotal: e.controlsTotal,
      summary: e.summary,
      scopes: [],
      stages: e.stages,
      allowedNextStatuses: [],
    }));
  }, [mode, apiAudits, demoEngagements, domainFilter]);

  const filteredEngagements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedRows.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.leadAuditor.toLowerCase().includes(q) ||
        item.businessUnit.toLowerCase().includes(q) ||
        item.framework.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [unifiedRows, searchQuery, statusFilter]);

  const featuredAudit = unifiedRows[0] ?? null;

  const manageAudit = useMemo(
    () => (manageAuditId ? unifiedRows.find((r) => r.id === manageAuditId) ?? null : null),
    [unifiedRows, manageAuditId]
  );

  const openManageModal = (row: UnifiedEngagementRow) => {
    setManageAuditId(row.id);
    setEditTitle(row.title);
    setEditDeptId(row.departmentId);
    setEditFramework(row.framework);
    setEditDueDate(row.targetDueRaw);
    setEditSummary(row.summary);
    setNewScopeName('');
    setNewScopeSystem('');
    setNewScopeClause('');
    setNewScopeInScope(true);
  };

  const handleSaveAuditDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageAudit || !canMutate || mode !== 'api') return;
    setSavingManage(true);
    try {
      const updated = await apiClient.put<AuditOut>(`/audits/${manageAudit.id}`, {
        title: editTitle.trim(),
        department_id: editDeptId || undefined,
        framework: editFramework.trim(),
        target_due_date: editDueDate || null,
        summary: editSummary.trim() || null,
      });
      onNotify(`Updated engagement ${updated.code}: ${updated.title}.`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to update audit details.');
    } finally {
      setSavingManage(false);
    }
  };

  const handleAddScope = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageAudit || !canMutate || mode !== 'api' || !newScopeName.trim() || !newScopeSystem.trim()) return;
    setScopeSaving(true);
    try {
      const created = await apiClient.post<AuditScopeOut>(`/audits/${manageAudit.id}/scopes`, {
        scope_name: newScopeName.trim(),
        system_or_process: newScopeSystem.trim(),
        regulatory_clause: newScopeClause.trim() || null,
        in_scope: newScopeInScope,
      });
      setNewScopeName('');
      setNewScopeSystem('');
      setNewScopeClause('');
      setNewScopeInScope(true);
      onNotify(`Added scope "${created.scope_name}" to ${manageAudit.code}.`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to add audit scope.');
    } finally {
      setScopeSaving(false);
    }
  };

  const handleToggleScope = async (scope: AuditScopeOut) => {
    if (!manageAudit || !canMutate || mode !== 'api') return;
    setScopeSaving(true);
    try {
      await apiClient.put<AuditScopeOut>(`/audits/${manageAudit.id}/scopes/${scope.id}`, {
        in_scope: !scope.in_scope,
      });
      onNotify(`Updated scope "${scope.scope_name}" (${!scope.in_scope ? 'In Scope' : 'Excluded'}).`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to update audit scope.');
    } finally {
      setScopeSaving(false);
    }
  };

  const handleDeleteScope = async (scope: AuditScopeOut) => {
    if (!manageAudit || !canMutate || mode !== 'api') return;
    setScopeSaving(true);
    try {
      await apiClient.delete(`/audits/${manageAudit.id}/scopes/${scope.id}`);
      onNotify(`Removed scope "${scope.scope_name}" from ${manageAudit.code}.`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to remove audit scope.');
    } finally {
      setScopeSaving(false);
    }
  };

  const summaryCounts = useMemo(() => {
    const inFlight = unifiedRows.filter((r) => r.status === 'In Progress').length;
    const reviewOrVerification = unifiedRows.filter((r) =>
      ['Review', 'Under Review', 'Verification', 'Action Required'].includes(r.status)
    ).length;
    const planned = unifiedRows.filter((r) => ['Draft', 'Scheduled'].includes(r.status)).length;
    return { inFlight, reviewOrVerification, planned };
  }, [unifiedRows]);

  const handleExportCsv = () => {
    auditService.exportCsvRows(
      `CompanyAudit_Engagements_${domainFilter ?? 'All'}.csv`,
      ['Code', 'Title', 'Domain', 'Framework', 'Business Unit', 'Lead Auditor', 'Target Due', 'Score', 'Status'],
      filteredEngagements.map((e) => [
        e.code,
        e.title,
        e.domain,
        e.framework,
        e.businessUnit,
        e.leadAuditor,
        e.targetDue,
        e.score !== null ? `${e.score.toFixed(1)}%` : 'Pending Start',
        e.status,
      ])
    );
    onNotify(`Downloaded CSV summary for ${filteredEngagements.length} audit engagements.`);
  };

  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate || !newAuditTitle.trim()) return;

    if (mode === 'demo') {
      const nextNum = 105 + demoEngagements.length;
      const created: AuditEngagement = {
        id: `aud-${nextNum}`,
        code: `AUD-2025-${nextNum}`,
        title: newAuditTitle.trim(),
        domain: newAuditDomain as AuditDomain,
        framework: newAuditFramework,
        businessUnit: newAuditUnit,
        leadAuditor: 'Eleanor Vance',
        leadInitials: 'EV',
        leadRole: 'Lead Auditor & CAO',
        targetDue: newAuditDueDate,
        score: null,
        status: 'Scheduled',
        controlsEvaluated: 0,
        controlsTotal: 22,
        summary: `Scoped fiduciary review for ${newAuditTitle.trim()} under ${newAuditFramework}.`,
        stages: [
          { name: 'Scope Defined', progress: 100, state: 'completed' },
          { name: 'Evidence Gathering', progress: 0, state: 'pending' },
          { name: 'Review & Testing', progress: 0, state: 'pending' },
          { name: 'Final Sign-off', progress: 0, state: 'pending' },
        ],
      };
      setDemoEngagements((prev) => [created, ...prev]);
      setNewAuditTitle('');
      setInitiateModalOpen(false);
      setSearchParams({});
      onNotify(`Initiated audit engagement ${created.code} (Demo Mode).`);
      return;
    }

    if (!newAuditDeptId) {
      onNotify('Please select a target business unit.');
      return;
    }

    setCreating(true);
    try {
      const created = await apiClient.post<AuditOut>('/audits', {
        title: newAuditTitle.trim(),
        domain: newAuditDomain,
        department_id: newAuditDeptId,
        framework: newAuditFramework.trim(),
        status: 'Scheduled',
        target_due_date: newAuditDueDate || null,
        summary: `Scoped ${newAuditDomain} audit engagement mapped to ${newAuditFramework.trim()}.`,
      });
      setNewAuditTitle('');
      setInitiateModalOpen(false);
      setSearchParams({});
      onNotify(`Initiated PostgreSQL engagement ${created.code}: ${created.title}.`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to create audit engagement.');
    } finally {
      setCreating(false);
    }
  };

  const handleTransitionStatus = async (audit: UnifiedEngagementRow, nextStatus: AuditStatusLiteral) => {
    if (!canMutate || mode !== 'api') return;
    setTransitioning(true);
    try {
      const updated = await apiClient.put<AuditOut>(`/audits/${audit.id}`, { status: nextStatus });
      setTransitionAudit(null);
      onNotify(`Transitioned ${updated.code} from ${audit.status} to ${updated.status}.`);
      await fetchData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Status transition blocked.');
    } finally {
      setTransitioning(false);
    }
  };

  const pageHeading = domainFilter ? `${domainFilter} Audit & Engagements` : 'Audits & Engagements';
  const breadcrumbLeaf = domainFilter ? `${domainFilter} Audit` : 'Active Engagements';
  const availableStatusOptions =
    mode === 'api'
      ? API_STATUS_OPTIONS
      : (['In Progress', 'Under Review', 'Scheduled', 'Completed'] as const);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Unified Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Audit Management', to: '/audits' },
          { label: breadcrumbLeaf },
        ]}
        title={pageHeading}
        description="Track active internal audits, statutory inspections, 7-state lifecycle gates, and domain telemetry across global business units."
        actions={
          <>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface shadow-exec-sm hover:bg-surface-container-low transition-colors"
            >
              <Download className="w-4 h-4 text-secondary" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              disabled={!canMutate}
              onClick={() => setInitiateModalOpen(true)}
              title={canMutate ? 'Initiate audit engagement' : 'Admin or Auditor role required'}
              className="inline-flex items-center gap-2 h-10 px-4 bg-secondary hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed text-on-secondary text-label-lg rounded-lg shadow-exec-sm transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Initiate Audit</span>
            </button>
          </>
        }
      />

      {/* Workspace Tabs + Domain Scope Filter Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <AuditWorkspaceNav />

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {DOMAIN_PILLS.map((pill) => {
            const isCurrent =
              (!domainFilter && pill.to === '/audits') || (domainFilter && pill.domain === domainFilter);
            return (
              <Link
                key={pill.to}
                to={pill.to}
                className={`px-3 py-1.5 rounded-lg text-label-md whitespace-nowrap transition-colors ${
                  isCurrent
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border border-border-hairline/80'
                }`}
              >
                {pill.label}
              </Link>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3-Card Operational Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-label-md text-outline uppercase tracking-wider block mb-1.5">
                Operational Cadence
              </span>
              <h2 className="text-display-md text-on-surface tracking-tight">
                {summaryCounts.inFlight} In Progress
              </h2>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-surface-container flex items-center justify-between text-outline">
            <span className="text-body-sm flex items-center gap-2 text-secondary font-medium">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              Active Fieldwork
            </span>
            <span className="font-mono text-data-mono">{unifiedRows.length} Total in View</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-label-md text-outline uppercase tracking-wider block mb-1.5">
                Verification &amp; Review
              </span>
              <h2 className="text-display-md text-on-surface tracking-tight">
                {summaryCounts.reviewOrVerification} Awaiting Gate
              </h2>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary-container">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-surface-container flex items-center justify-between gap-2">
            <span className="text-body-sm text-on-surface-variant font-medium">
              Review / Action Required / Verification
            </span>
            <StatusBadge tone="info">Lifecycle Enforced</StatusBadge>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-label-md text-outline uppercase tracking-wider block mb-1.5">
                Forecast Pipeline
              </span>
              <h2 className="text-display-md text-on-surface tracking-tight">
                {summaryCounts.planned} Planned
              </h2>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-outline">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-surface-container flex items-center justify-between text-outline">
            <span className="text-body-sm text-on-surface-variant">Draft &amp; Scheduled Engagements</span>
            <span className="font-mono text-data-mono">FY 2025–2026</span>
          </div>
        </div>
      </div>

      {/* Live Domain Telemetry Panel (when viewing /audits/financial, /hr, /project, /customer, /technology, /operations in API Mode) */}
      {mode === 'api' && domainFilter && telemetry && (
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-secondary" />
                <h2 className="text-headline-md font-bold text-primary">
                  {domainFilter} Domain Telemetry Feed
                </h2>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                Live operational assurance metrics ingested from {domainFilter} PostgreSQL records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(telemetry.summary_kpis).map(([k, v]) => (
                <span
                  key={k}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-low border border-border-hairline font-mono text-label-sm text-primary"
                >
                  {k.replace(/_/g, ' ')}: <strong className="text-secondary">{String(v)}</strong>
                </span>
              ))}
            </div>
          </div>

          {telemetry.financial_metrics.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              {telemetry.financial_metrics.slice(0, 6).map((m) => (
                <div key={m.id} className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-label-sm font-bold text-secondary">{m.metric_code}</span>
                    <StatusBadge tone={m.sox_control_verified ? 'success' : 'warning'}>
                      {m.sox_control_verified ? 'SOX Verified' : 'Review Variance'}
                    </StatusBadge>
                  </div>
                  <div className="text-headline-sm font-semibold text-primary mt-1">{m.metric_name}</div>
                  <div className="font-mono text-body-sm text-on-surface-variant mt-1">
                    Reported: {m.currency} {m.reported_amount.toLocaleString()}{' '}
                    {m.variance_pct != null ? `(${m.variance_pct > 0 ? '+' : ''}${m.variance_pct}%)` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {telemetry.employees.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              {telemetry.employees.slice(0, 6).map((emp) => (
                <div key={emp.id} className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-label-sm font-bold text-secondary">{emp.employee_code}</span>
                    <StatusBadge tone={emp.security_training_completed ? 'success' : 'danger'}>
                      {emp.security_training_completed ? 'Training Complete' : 'Training Overdue'}
                    </StatusBadge>
                  </div>
                  <div className="text-headline-sm font-semibold text-primary mt-1">{emp.full_name}</div>
                  <div className="text-body-sm text-on-surface-variant mt-0.5">
                    {emp.role_title || emp.department_name} • Background Check:{' '}
                    {emp.background_check_verified ? 'Verified' : 'Pending'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {telemetry.projects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              {telemetry.projects.map((p) => (
                <div key={p.id} className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-label-sm font-bold text-secondary">{p.code}</span>
                    <StatusBadge tone={p.status === 'At Risk' ? 'danger' : 'info'}>{p.status}</StatusBadge>
                  </div>
                  <div className="text-headline-sm font-semibold text-primary mt-1">{p.name}</div>
                  <div className="text-body-sm text-on-surface-variant mt-1">
                    Budget ${p.budget_amount.toLocaleString()} vs Spend ${p.actual_spend.toLocaleString()} •{' '}
                    {p.tasks.length} Stage Gates
                  </div>
                </div>
              ))}
            </div>
          )}

          {telemetry.customers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              {telemetry.customers.map((c) => (
                <div key={c.id} className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-label-sm font-bold text-secondary">{c.account_code}</span>
                    <StatusBadge tone={c.dpa_signed ? 'success' : 'danger'}>
                      {c.dpa_signed ? 'DPA Signed' : 'Missing DPA'}
                    </StatusBadge>
                  </div>
                  <div className="text-headline-sm font-semibold text-primary mt-1">{c.organization_name}</div>
                  <div className="text-body-sm text-on-surface-variant mt-1">
                    {c.region} • SLA {c.sla_compliance_pct}% • Open DSARs: {c.dsar_requests_open}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Lead Inspection Spotlight */}
      {featuredAudit && (
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <StatusBadge tone="primary">Lead Inspection</StatusBadge>
                <span className="font-mono text-data-mono text-secondary font-semibold">{featuredAudit.code}</span>
                <span className="text-outline-variant">•</span>
                <span className="text-label-md text-outline">{featuredAudit.framework}</span>
              </div>
              <h2 className="text-headline-lg text-primary font-bold tracking-tight">
                {featuredAudit.title}
              </h2>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">{featuredAudit.summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-label-md">
                  {featuredAudit.leadInitials}
                </div>
                <div className="flex flex-col">
                  <span className="text-label-lg text-on-surface font-semibold">{featuredAudit.leadAuditor}</span>
                  <span className="text-label-sm text-outline">{featuredAudit.leadRole}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    mode === 'api'
                      ? `/audits/checklists?auditId=${encodeURIComponent(featuredAudit.id)}&domain=${encodeURIComponent(featuredAudit.domain)}`
                      : '/audits/checklists'
                  )
                }
                className="inline-flex items-center gap-2 h-10 bg-primary-container hover:bg-primary text-on-primary text-label-lg px-4 rounded-lg shadow-exec-sm transition-colors"
              >
                <span>Open Checklist</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setSpotlightExpanded((prev) => !prev)}
                aria-label="Toggle stage milestones"
                className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
              >
                {spotlightExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {spotlightExpanded && (
            <div className="mt-5 pt-5 border-t border-surface-container flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                    Execution Milestones
                  </span>
                  <span className="font-mono text-data-mono text-secondary font-bold">
                    {featuredAudit.controlsTotal > 0
                      ? `${Math.round((featuredAudit.controlsEvaluated / featuredAudit.controlsTotal) * 100)}% Completed`
                      : '0% Completed'}{' '}
                    ({featuredAudit.controlsEvaluated}/{featuredAudit.controlsTotal} controls)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-body-sm text-outline">Computed Health:</span>
                  <span className="font-mono text-headline-sm font-bold text-on-surface bg-surface-container-low px-2.5 py-0.5 rounded border border-border-hairline tabular-nums">
                    {featuredAudit.score !== null ? `${featuredAudit.score.toFixed(1)}%` : 'Pending Start'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {featuredAudit.stages.map((stage) => (
                  <div
                    key={stage.name}
                    className="p-3.5 rounded-lg bg-surface-container-low/70 border border-border-hairline/60 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-label-md flex items-center gap-1.5 ${
                          stage.state === 'completed'
                            ? 'text-on-surface font-semibold'
                            : stage.state === 'active'
                              ? 'text-secondary font-bold'
                              : 'text-outline'
                        }`}
                      >
                        {stage.state === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />}
                        {stage.state === 'active' && <RefreshCw className="w-3.5 h-3.5 text-secondary" />}
                        {stage.name}
                      </span>
                      <span
                        className={`font-mono text-label-sm tabular-nums ${
                          stage.state === 'active' ? 'text-secondary font-semibold' : 'text-outline'
                        }`}
                      >
                        {stage.progress}%
                      </span>
                    </div>
                    <ProgressBar
                      value={stage.progress}
                      heightClass="h-1.5"
                      trackClass="bg-surface-container-high"
                      fillClass="bg-secondary-container"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dedicated Filter Toolbar */}
      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter engagements by title, code, lead auditor, or unit..."
        activeFilterCount={statusFilter !== 'All' ? 1 : 0}
        onReset={() => {
          setSearchQuery('');
          setStatusFilter('All');
        }}
        rightActions={
          <button
            type="button"
            onClick={() => setShowFrameworkCol((prev) => !prev)}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-label-md transition-colors"
          >
            <Columns3 className="w-4 h-4 text-secondary" />
            <span>{showFrameworkCol ? 'Hide Framework' : 'Show Framework'}</span>
          </button>
        }
      >
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by audit status"
          className="h-10 bg-surface-container-low/70 text-on-surface text-body-sm px-3.5 rounded-lg border border-border-hairline focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">All Statuses ({unifiedRows.length})</option>
          {availableStatusOptions.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </FilterToolbar>

      {/* Active Engagements Roster Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 flex items-center justify-between border-b border-surface-container">
          <div>
            <h3 className="text-headline-md text-primary font-bold">Active Engagements Roster</h3>
            <span className="text-body-sm text-outline">
              Showing {filteredEngagements.length} enterprise audit cycles for FY 2025
            </span>
          </div>
        </div>

        {mode === 'api' && loading && unifiedRows.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading audit engagements...</div>
        ) : filteredEngagements.length === 0 ? (
          <EmptyState
            title="No matching audit engagements"
            description="No engagements match your current search or status criteria. Reset filters to view all active cycles."
            actionLabel="Reset Filters"
            onAction={() => {
              setSearchQuery('');
              setStatusFilter('All');
            }}
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left min-w-[960px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Audit Title &amp; Code</th>
                  {showFrameworkCol && <th className="py-3.5 px-5 font-semibold">Framework</th>}
                  <th className="py-3.5 px-5 font-semibold">Business Unit</th>
                  <th className="py-3.5 px-5 font-semibold">Lead Auditor</th>
                  <th className="py-3.5 px-5 font-semibold">Target Due</th>
                  <th className="py-3.5 px-5 font-semibold">Score / Health</th>
                  <th className="py-3.5 px-5 font-semibold">Lifecycle Status</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container/80">
                {filteredEngagements.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() =>
                      navigate(
                        mode === 'api'
                          ? `/audits/checklists?auditId=${encodeURIComponent(row.id)}&domain=${encodeURIComponent(row.domain)}`
                          : '/audits/checklists'
                      )
                    }
                    className="hover:bg-surface-container-low/60 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="text-headline-sm text-on-surface group-hover:text-secondary font-semibold transition-colors">
                          {row.title}
                        </span>
                        <span className="font-mono text-label-sm text-outline mt-0.5">
                          {row.code} • {row.domain}
                        </span>
                      </div>
                    </td>
                    {showFrameworkCol && (
                      <td className="py-4 px-5">
                        <span className="text-body-sm text-on-surface">{row.framework}</span>
                      </td>
                    )}
                    <td className="py-4 px-5 text-body-sm text-on-surface-variant">{row.businessUnit}</td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-surface-container-highest text-on-primary-fixed-variant text-label-sm flex items-center justify-center font-bold shrink-0">
                          {row.leadInitials}
                        </div>
                        <span className="text-body-sm text-on-surface font-medium">{row.leadAuditor}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 font-mono text-data-mono text-on-surface tabular-nums whitespace-nowrap">
                      {row.targetDue}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      {row.score !== null ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-headline-sm text-on-surface font-semibold tabular-nums">
                            {row.score.toFixed(1)}%
                          </span>
                          <div className="w-16">
                            <ProgressBar
                              value={row.score}
                              heightClass="h-1.5"
                              trackClass="bg-surface-container-high"
                              fillClass={
                                row.status === 'Closed' || row.status === 'Completed'
                                  ? 'bg-primary-container'
                                  : 'bg-secondary-container'
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-body-sm text-outline">Pending Start</span>
                      )}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <StatusBadge dot tone={getAuditStatusTone(row.status)}>
                        {row.status}
                      </StatusBadge>
                    </td>
                    <td
                      className="py-4 px-6 text-right whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div className="inline-flex items-center gap-2">
                        {mode === 'api' && canMutate && (
                          <button
                            type="button"
                            onClick={() => openManageModal(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border-hairline bg-surface-container-lowest text-on-surface-variant hover:text-secondary hover:border-secondary/40 text-label-sm font-semibold transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit &amp; Scopes ({row.scopes.length})</span>
                          </button>
                        )}
                        {mode === 'api' && row.allowedNextStatuses.length > 0 && canMutate && (
                          <button
                            type="button"
                            onClick={() => setTransitionAudit(row)}
                            className="px-2.5 py-1.5 rounded-lg bg-secondary-fixed text-secondary text-label-sm font-semibold hover:bg-secondary hover:text-on-secondary transition-colors"
                          >
                            Advance Stage
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              mode === 'api'
                                ? `/audits/checklists?auditId=${encodeURIComponent(row.id)}&domain=${encodeURIComponent(row.domain)}`
                                : '/audits/checklists'
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-label-sm font-semibold transition-colors"
                        >
                          Checklists →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transition 7-State Lifecycle Modal */}
      {transitionAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setTransitionAudit(null)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10">
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <div>
                <span className="font-mono text-label-sm font-bold text-secondary">{transitionAudit.code}</span>
                <h3 className="text-headline-md text-primary font-bold">7-State Lifecycle Transition</h3>
              </div>
              <button
                type="button"
                onClick={() => setTransitionAudit(null)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-body-sm text-on-surface-variant">
                Current state:{' '}
                <StatusBadge tone={getAuditStatusTone(transitionAudit.status)}>
                  {transitionAudit.status}
                </StatusBadge>
              </div>
              <p className="text-body-sm text-outline">
                Select an authorized next stage. Transitioning to <strong>Closed</strong> requires all linked findings
                to be closed or signed off.
              </p>
              <div className="flex flex-col gap-2">
                {transitionAudit.allowedNextStatuses.map((nextSt) => (
                  <button
                    key={nextSt}
                    type="button"
                    disabled={transitioning}
                    onClick={() => void handleTransitionStatus(transitionAudit, nextSt)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border-hairline hover:border-secondary hover:bg-surface-container-low text-left transition-colors"
                  >
                    <span className="text-headline-sm font-semibold text-primary">Move to {nextSt}</span>
                    {nextSt === 'Closed' ? (
                      <ShieldAlert className="w-4 h-4 text-secondary" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-secondary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Audit & Scopes CRUD Modal */}
      {manageAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setManageAuditId(null)} />
          <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10 my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <div>
                <span className="font-mono text-label-sm font-bold text-secondary">
                  {manageAudit.code} • {manageAudit.status}
                </span>
                <h2 className="text-headline-lg text-primary font-bold">Edit Engagement &amp; Scopes</h2>
              </div>
              <button
                type="button"
                onClick={() => setManageAuditId(null)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
                aria-label="Close edit engagement modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <form onSubmit={handleSaveAuditDetails} className="space-y-4">
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Engagement Title
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Business Unit
                    </label>
                    <select
                      value={editDeptId}
                      onChange={(e) => setEditDeptId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Target Due Date
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Statutory Framework
                  </label>
                  <input
                    type="text"
                    required
                    value={editFramework}
                    onChange={(e) => setEditFramework(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md"
                  />
                </div>
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Engagement Summary
                  </label>
                  <textarea
                    rows={2}
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    className="w-full p-3 rounded-lg border border-border-hairline text-body-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingManage}
                    className="h-9 px-4 rounded-lg bg-secondary text-on-secondary text-label-md font-semibold hover:bg-secondary-container disabled:opacity-60"
                  >
                    {savingManage ? 'Saving Changes...' : 'Save Engagement Details'}
                  </button>
                </div>
              </form>

              <div className="pt-5 border-t border-border-hairline space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-headline-md text-primary font-bold">
                      Defined Audit Scopes ({manageAudit.scopes.length})
                    </h3>
                    <p className="text-body-sm text-on-surface-variant">
                      Boundary systems, processes, and statutory clauses covered by {manageAudit.code}.
                    </p>
                  </div>
                  {manageAudit.status === 'Closed' && (
                    <StatusBadge tone="neutral">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Closed — Scopes Locked</span>
                    </StatusBadge>
                  )}
                </div>

                {manageAudit.scopes.length === 0 ? (
                  <div className="p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline text-body-sm text-outline">
                    No explicit scope items registered yet for this engagement.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manageAudit.scopes.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-3.5 rounded-xl bg-surface-container-low/70 border border-border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-label-lg font-bold text-on-surface">{sc.scope_name}</span>
                            <StatusBadge tone={sc.in_scope ? 'success' : 'neutral'}>
                              {sc.in_scope ? 'In Scope' : 'Excluded'}
                            </StatusBadge>
                          </div>
                          <div className="text-body-sm text-on-surface-variant mt-0.5">
                            {sc.system_or_process}
                            {sc.regulatory_clause ? ` • Clause: ${sc.regulatory_clause}` : ''}
                          </div>
                        </div>
                        {manageAudit.status !== 'Closed' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={scopeSaving}
                              onClick={() => void handleToggleScope(sc)}
                              className="h-8 px-2.5 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-sm font-semibold hover:border-secondary"
                            >
                              {sc.in_scope ? 'Exclude' : 'Include'}
                            </button>
                            <button
                              type="button"
                              disabled={scopeSaving}
                              onClick={() => void handleDeleteScope(sc)}
                              aria-label={`Delete scope ${sc.scope_name}`}
                              className="h-8 px-2.5 rounded-lg border border-error/30 text-error hover:bg-error-container/40 text-label-sm font-semibold inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {manageAudit.status !== 'Closed' && (
                  <form
                    onSubmit={handleAddScope}
                    className="p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline space-y-3"
                  >
                    <span className="text-label-md uppercase font-bold text-primary block">Add Scope Boundary</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={newScopeName}
                        onChange={(e) => setNewScopeName(e.target.value)}
                        placeholder="Scope name (e.g. Cloud IAM Fed)"
                        className="h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                      />
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={newScopeSystem}
                        onChange={(e) => setNewScopeSystem(e.target.value)}
                        placeholder="System or process (e.g. AWS IAM & Okta)"
                        className="h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="text"
                        value={newScopeClause}
                        onChange={(e) => setNewScopeClause(e.target.value)}
                        placeholder="Regulatory clause (optional, e.g. SOC 2 CC6.1)"
                        className="flex-1 h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                      />
                      <label className="inline-flex items-center gap-2 text-body-sm text-on-surface cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newScopeInScope}
                          onChange={(e) => setNewScopeInScope(e.target.checked)}
                          className="rounded text-secondary"
                        />
                        <span>In Scope</span>
                      </label>
                      <button
                        type="submit"
                        disabled={scopeSaving || !newScopeName.trim() || !newScopeSystem.trim()}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary-container text-on-primary text-label-md font-semibold disabled:opacity-60"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Scope</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Initiate Audit Modal */}
      {initiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]"
            onClick={() => setInitiateModalOpen(false)}
          />
          <form
            onSubmit={handleCreateAudit}
            className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <h2 className="text-headline-lg text-primary">Initiate New Audit Engagement</h2>
              <button
                type="button"
                onClick={() => setInitiateModalOpen(false)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!canMutate && (
                <div className="p-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-body-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Only Admin or Auditor roles can create new engagements.</span>
                </div>
              )}
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Engagement Title
                </label>
                <input
                  type="text"
                  required
                  value={newAuditTitle}
                  onChange={(e) => setNewAuditTitle(e.target.value)}
                  placeholder="e.g. Q1 Zero-Trust Network & IAM Assurance"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Audit Domain
                  </label>
                  <select
                    value={newAuditDomain}
                    onChange={(e) => setNewAuditDomain(e.target.value as AuditDomainLiteral)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md bg-surface-container-lowest focus:outline-none focus:border-secondary"
                  >
                    <option value="Technology">Technology</option>
                    <option value="Financial">Financial</option>
                    <option value="HR">HR</option>
                    <option value="Project">Project</option>
                    <option value="Customer">Customer</option>
                    <option value="Operations">Operations</option>
                    <option value="Compliance">Compliance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Target Due Date
                  </label>
                  <input
                    type="date"
                    value={newAuditDueDate}
                    onChange={(e) => setNewAuditDueDate(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Statutory Framework
                </label>
                <input
                  type="text"
                  required
                  value={newAuditFramework}
                  onChange={(e) => setNewAuditFramework(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Business Unit
                </label>
                {mode === 'api' && departments.length > 0 ? (
                  <select
                    required
                    value={newAuditDeptId}
                    onChange={(e) => setNewAuditDeptId(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md bg-surface-container-lowest focus:outline-none focus:border-secondary"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newAuditUnit}
                    onChange={(e) => setNewAuditUnit(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                  />
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setInitiateModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canMutate || creating}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-60"
              >
                {creating ? 'Scheduling...' : 'Create & Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
