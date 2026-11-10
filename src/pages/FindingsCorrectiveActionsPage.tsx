import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FilePenLine,
  Flag,
  History,
  Kanban,
  MessageSquarePlus,
  Paperclip,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  TableProperties,
  Terminal,
  Timer,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar } from '../components/ui/FilterToolbar';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SlideOverDrawer } from '../components/ui/SlideOverDrawer';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import {
  ActionStatusLiteral,
  AuditOut,
  CorrectiveActionOut,
  DepartmentOut,
  FindingOut,
  PaginatedResponse,
  RecommendationOut,
  SeverityLiteral,
  UserSummary,
} from '../types/api';
import { AuditFinding, FindingSeverity, FindingStatus } from '../types/audit';

interface FindingsCorrectiveActionsPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedMilestone {
  id: string;
  code?: string;
  step: number;
  title: string;
  detail: string;
  status: 'completed' | 'active' | 'pending';
  rawActionStatus?: ActionStatusLiteral;
  progressPercent: number;
  dueDate?: string;
  assignee?: string | null;
}

interface UnifiedEvidenceItem {
  id?: string;
  filename: string;
  meta: string;
  icon: 'terminal' | 'shield';
  verificationStatus?: string;
}

interface UnifiedFinding {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  rootCauseShort: string;
  rootCauseDetailed: string;
  departmentId: string;
  department: string;
  workstream: string;
  severity: FindingSeverity;
  tierLabel: string;
  ownerUserId: string | null;
  owner: {
    name: string;
    initials: string;
    avatarBg: string;
  };
  leadAuditor: string;
  targetSla: string;
  slaCountdown: string;
  isOverdue: boolean;
  progress: number;
  progressLabel: 'Overdue' | 'Review' | 'Active' | 'Closed';
  status: FindingStatus;
  actionType: 'Verify' | 'Update' | 'Close' | 'Inspect';
  managementResponse: string | null;
  rejectionReason: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  recommendations: RecommendationOut[];
  milestones: UnifiedMilestone[];
  evidence: UnifiedEvidenceItem[];
}

function mapActionStatusToStepState(status: ActionStatusLiteral): 'completed' | 'active' | 'pending' {
  if (status === 'Verified' || status === 'Submitted') return 'completed';
  if (status === 'In Progress') return 'active';
  return 'pending';
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FindingsCorrectiveActionsPage: React.FC<FindingsCorrectiveActionsPageProps> = ({
  onNotify,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode, hasRole, user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();

  // API state
  const [apiFindings, setApiFindings] = useState<FindingOut[]>([]);
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [orgUsers, setOrgUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Demo state
  const [demoFindings, setDemoFindings] = useState<AuditFinding[]>(() => auditService.getFindings());

  // View & Filter state
  const [activeTab, setActiveTab] = useState<'all' | 'action-plan' | 'verification' | 'closed'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'All'>('All');
  const [slaAtRiskOnly, setSlaAtRiskOnly] = useState(false);
  const [myActionsOnly, setMyActionsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Inspection Drawer
  const [selectedFindingId, setSelectedFindingId] = useState<string>('FND-1024');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'milestones' | 'evidence'>('overview');

  // Management Response / Note Modal
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  // Verification Rejection Modal & Delete Confirmations
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDeleteFinding, setConfirmDeleteFinding] = useState(false);
  const [confirmDeleteActionId, setConfirmDeleteActionId] = useState<string | null>(null);

  // Log New Finding Modal
  const [logFindingOpen, setLogFindingOpen] = useState(false);
  const [newFindingAuditId, setNewFindingAuditId] = useState('');
  const [newFindingDeptId, setNewFindingDeptId] = useState('');
  const [newFindingOwnerId, setNewFindingOwnerId] = useState('');
  const [newFindingDeptDemo, setNewFindingDeptDemo] = useState('Technology / SecOps');
  const [newFindingTitle, setNewFindingTitle] = useState('');
  const [newFindingRootCause, setNewFindingRootCause] = useState('');
  const [newFindingWorkstream, setNewFindingWorkstream] = useState('');
  const [newFindingSeverity, setNewFindingSeverity] = useState<FindingSeverity>('High');
  const [newFindingSlaDate, setNewFindingSlaDate] = useState('2026-01-31');

  // Inline Corrective Action Form (inside Drawer)
  const [addActionOpen, setAddActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDetail, setActionDetail] = useState('');
  const [actionDueDate, setActionDueDate] = useState('2026-01-15');

  // Inline Recommendation Form (inside Drawer)
  const [addRecOpen, setAddRecOpen] = useState(false);
  const [recTitle, setRecTitle] = useState('');
  const [recGuidance, setRecGuidance] = useState('');
  const [recPriority, setRecPriority] = useState<SeverityLiteral>('High');
  const [respondingRecId, setRespondingRecId] = useState<string | null>(null);
  const [recResponseText, setRecResponseText] = useState('');

  const canCreateFinding = hasRole('Admin', 'Auditor');
  const canVerifyActions = hasRole('Admin', 'Auditor');
  const canSignOff = hasRole('Admin', 'Management');
  const canRejectVerification = hasRole('Admin', 'Auditor', 'Management');
  const canDeleteFinding = hasRole('Admin', 'Auditor');
  const canSubmitForVerification = hasRole('Auditor');

  const fetchFindingsData = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [fndRes, audRes, deptRes, usersRes] = await Promise.all([
        apiClient.get<PaginatedResponse<FindingOut>>('/findings?limit=200'),
        apiClient.get<PaginatedResponse<AuditOut>>('/audits?limit=100'),
        apiClient.get<DepartmentOut[]>('/departments'),
        apiClient.get<UserSummary[]>('/auth/users'),
      ]);
      setApiFindings(fndRes.items);
      setAudits(audRes.items);
      setDepartments(deptRes);
      setOrgUsers(usersRes);

      if (audRes.items.length > 0) {
        setNewFindingAuditId((prev) => prev || audRes.items[0].id);
        setNewFindingDeptId((prev) => prev || audRes.items[0].department_id || deptRes[0]?.id || '');
      } else if (deptRes.length > 0) {
        setNewFindingDeptId((prev) => prev || deptRes[0].id);
      }
      if (fndRes.items.length > 0) {
        setSelectedFindingId((prev) =>
          prev && fndRes.items.some((f) => f.id === prev) ? prev : fndRes.items[0].id
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load findings register.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchFindingsData();
  }, [fetchFindingsData]);

  // Support deep-link from Audit Checklists "Raise Finding" button (?openLog=1&auditId=...&title=...)
  useEffect(() => {
    const openLog = searchParams.get('openLog');
    if (openLog !== '1') return;

    const auditIdParam = searchParams.get('auditId');
    const titleParam = searchParams.get('title');
    if (canCreateFinding) {
      if (titleParam) setNewFindingTitle(titleParam);
      if (auditIdParam) {
        setNewFindingAuditId(auditIdParam);
        const matchedAudit = audits.find((a) => a.id === auditIdParam);
        if (matchedAudit) {
          setNewFindingDeptId(matchedAudit.department_id);
        }
      }
      setLogFindingOpen(true);
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openLog');
    nextParams.delete('auditId');
    nextParams.delete('title');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, audits, canCreateFinding]);

  const unifiedFindings: UnifiedFinding[] = useMemo(() => {
    if (mode === 'api') {
      return apiFindings.map((f) => {
        const progressLabel: UnifiedFinding['progressLabel'] =
          f.status === 'Closed'
            ? 'Closed'
            : f.is_overdue || f.status === 'Overdue'
              ? 'Overdue'
              : f.status === 'Verification Pending'
                ? 'Review'
                : 'Active';
        const actionType: UnifiedFinding['actionType'] =
          f.status === 'Closed'
            ? 'Inspect'
            : f.status === 'Verification Pending'
              ? 'Verify'
              : 'Update';

        return {
          id: f.id,
          code: f.code,
          title: f.title,
          shortTitle: f.title,
          rootCauseShort: f.root_cause.length > 85 ? `${f.root_cause.slice(0, 82)}...` : f.root_cause,
          rootCauseDetailed: f.root_cause,
          departmentId: f.department_id,
          department: f.department_name,
          workstream: f.workstream || `${f.audit_code} • ${f.department_name}`,
          severity: f.severity,
          tierLabel: f.severity === 'Critical' ? 'Tier 1 Critical' : `${f.severity} Risk`,
          ownerUserId: f.owner_user_id,
          owner: {
            name: f.owner_name,
            initials: f.owner_initials,
            avatarBg:
              f.severity === 'Critical'
                ? 'bg-primary-container text-white'
                : 'bg-surface-container-highest text-primary',
          },
          leadAuditor: f.lead_auditor_name,
          targetSla: f.target_sla_date,
          slaCountdown: f.sla_countdown,
          isOverdue: f.is_overdue || f.status === 'Overdue',
          progress: f.progress_percent,
          progressLabel,
          status: f.status,
          actionType,
          managementResponse: f.management_response,
          rejectionReason: f.rejection_reason ?? null,
          signedOffBy: f.signed_off_by_name,
          signedOffAt: f.signed_off_at,
          recommendations: f.recommendations,
          milestones: f.corrective_actions.map((ca) => ({
            id: ca.id,
            code: ca.code,
            step: ca.step_order,
            title: `${ca.code}: ${ca.title}`,
            detail: `${ca.status} • Due ${ca.due_date}${ca.assigned_to_name ? ` • ${ca.assigned_to_name}` : ''}${ca.detail ? ` — ${ca.detail}` : ''}`,
            status: mapActionStatusToStepState(ca.status),
            rawActionStatus: ca.status,
            progressPercent: ca.progress_percent,
            dueDate: ca.due_date,
            assignee: ca.assigned_to_name,
          })),
          evidence: f.evidence_items.map((ev) => ({
            id: ev.id,
            filename: ev.filename,
            meta: `${formatByteSize(ev.byte_size)} • SHA-256: ${ev.sha256_hash.slice(0, 12)}...`,
            icon: ev.mime_type.includes('text') || ev.filename.endsWith('.log') ? 'terminal' : 'shield',
            verificationStatus: ev.verification_status,
          })),
        };
      });
    }

    return demoFindings.map((f) => {
      const mappedProgressLabel: UnifiedFinding['progressLabel'] =
        f.progressLabel === 'Completed'
          ? 'Closed'
          : f.progressLabel === 'Stalled'
            ? 'Overdue'
            : f.progressLabel;
      return {
        id: f.id,
        code: f.id,
        title: f.title,
        shortTitle: f.shortTitle,
        rootCauseShort: f.rootCauseShort,
        rootCauseDetailed: f.rootCauseDetailed,
        departmentId: f.department,
        department: f.department,
        workstream: f.workstream,
        severity: f.severity,
        tierLabel: f.tierLabel,
        ownerUserId: null,
        owner: f.owner,
        leadAuditor: f.leadAuditor,
        targetSla: f.targetSla,
        slaCountdown: f.slaCountdown,
        isOverdue: Boolean(f.isOverdue),
        progress: f.progress,
        progressLabel: mappedProgressLabel,
        status: f.status,
        actionType: f.actionType,
        managementResponse: null,
        rejectionReason: null,
        signedOffBy: null,
        signedOffAt: null,
        recommendations: [],
        milestones: f.milestones.map((m) => ({
          id: m.id,
          step: m.step,
          title: m.title,
          detail: m.detail,
          status: m.status,
          progressPercent: m.status === 'completed' ? 100 : m.status === 'active' ? 50 : 0,
        })),
        evidence: f.evidence.map((ev) => ({
          filename: ev.filename,
          meta: ev.meta,
          icon: ev.icon === 'terminal' ? 'terminal' : 'shield',
        })),
      };
    });
  }, [mode, apiFindings, demoFindings]);

  const departmentFilterOptions = useMemo(() => {
    const names = Array.from(new Set(unifiedFindings.map((f) => f.department))).sort();
    return names;
  }, [unifiedFindings]);

  const activeFilterCount =
    (departmentFilter !== 'All Departments' ? 1 : 0) +
    (severityFilter !== 'All' ? 1 : 0) +
    (statusFilter !== 'All' ? 1 : 0) +
    (slaAtRiskOnly ? 1 : 0) +
    (myActionsOnly ? 1 : 0);

  const resetAllFilters = () => {
    setSearchQuery('');
    setDepartmentFilter('All Departments');
    setSeverityFilter('All');
    setStatusFilter('All');
    setSlaAtRiskOnly(false);
    setMyActionsOnly(false);
    setPage(1);
  };

  const filteredFindings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return unifiedFindings.filter((item) => {
      if (activeTab === 'verification' && item.status !== 'Verification Pending') return false;
      if (activeTab === 'closed' && item.status !== 'Closed') return false;
      if (activeTab === 'action-plan' && item.status === 'Closed') return false;

      if (slaAtRiskOnly && !item.isOverdue && item.progress > 70) return false;
      if (myActionsOnly && user) {
        const uName = user.full_name.toLowerCase();
        const matchesOwner =
          item.owner.name.toLowerCase().includes(uName) ||
          item.leadAuditor.toLowerCase().includes(uName) ||
          item.ownerUserId === user.id;
        if (!matchesOwner) return false;
      }

      const matchesQuery =
        !query ||
        item.code.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.rootCauseDetailed.toLowerCase().includes(query) ||
        item.owner.name.toLowerCase().includes(query);

      const matchesDept = departmentFilter === 'All Departments' || item.department === departmentFilter;
      const matchesSeverity = severityFilter === 'All' || item.severity === severityFilter;
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;

      return matchesQuery && matchesDept && matchesSeverity && matchesStatus;
    });
  }, [
    unifiedFindings,
    activeTab,
    slaAtRiskOnly,
    myActionsOnly,
    user,
    searchQuery,
    departmentFilter,
    severityFilter,
    statusFilter,
  ]);

  // Reset page when filter count shrinks
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
    if (page > totalPages) setPage(1);
  }, [filteredFindings.length, page]);

  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const pagedFindings = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFindings.slice(start, start + pageSize);
  }, [filteredFindings, page]);

  // Live KPI metrics derived from dataset
  const metrics = useMemo(() => {
    const open = unifiedFindings.filter((f) => f.status !== 'Closed');
    const critOpen = open.filter((f) => f.severity === 'Critical').length;
    const highOpen = open.filter((f) => f.severity === 'High').length;
    const overdueCount = open.filter((f) => f.isOverdue).length;
    const verificationCount = unifiedFindings.filter((f) => f.status === 'Verification Pending').length;
    const closedCount = unifiedFindings.filter((f) => f.status === 'Closed').length;

    const allMilestones = unifiedFindings.flatMap((f) => f.milestones);
    const inFlightActions = allMilestones.filter((m) => m.status !== 'completed').length;
    const completedActions = allMilestones.filter((m) => m.status === 'completed').length;

    const velocity =
      unifiedFindings.length > 0
        ? Number(
            (
              ((unifiedFindings.length - overdueCount) / unifiedFindings.length) *
              100
            ).toFixed(1)
          )
        : 100;

    return {
      total: unifiedFindings.length,
      openCount: open.length,
      critOpen,
      highOpen,
      inFlightActions: inFlightActions || open.length,
      completedActions,
      overdueCount,
      verificationCount,
      closedCount,
      velocity,
    };
  }, [unifiedFindings]);

  const selectedFinding = useMemo(() => {
    return unifiedFindings.find((f) => f.id === selectedFindingId) ?? unifiedFindings[0] ?? null;
  }, [unifiedFindings, selectedFindingId]);

  const canManageSelectedActions = useMemo(() => {
    if (!selectedFinding) return false;
    if (hasRole('Admin', 'Auditor')) return true;
    if (hasRole('Department Head')) {
      return mode === 'demo' || user?.department_id === selectedFinding.departmentId;
    }
    return false;
  }, [selectedFinding, hasRole, mode, user]);

  const canRespondSelectedFinding = useMemo(() => {
    if (!selectedFinding) return false;
    if (hasRole('Admin', 'Auditor', 'Management')) return true;
    if (hasRole('Department Head')) {
      return mode === 'demo' || user?.department_id === selectedFinding.departmentId;
    }
    return false;
  }, [selectedFinding, hasRole, mode, user]);

  const openFindingDrawer = (
    findingId: string,
    tab: 'overview' | 'milestones' | 'evidence' = 'overview'
  ) => {
    setSelectedFindingId(findingId);
    setDrawerTab(tab);
    setAddActionOpen(false);
    setAddRecOpen(false);
    setRespondingRecId(null);
    setConfirmDeleteFinding(false);
    setConfirmDeleteActionId(null);
    setDrawerOpen(true);
  };

  const handleToggleOrAdvanceMilestone = async (ms: UnifiedMilestone) => {
    if (!selectedFinding || !canManageSelectedActions) {
      onNotify('You do not have permission to modify corrective actions on this department.');
      return;
    }

    if (mode === 'demo') {
      const demoTarget = demoFindings.find((f) => f.id === selectedFinding.id);
      if (!demoTarget) return;
      const updatedMilestones = demoTarget.milestones.map((m) => {
        if (m.id !== ms.id) return m;
        const nextStatus: 'completed' | 'active' | 'pending' =
          m.status === 'completed' ? 'active' : 'completed';
        return { ...m, status: nextStatus };
      });
      const completed = updatedMilestones.filter((m) => m.status === 'completed').length;
      const progress = Math.round((completed / updatedMilestones.length) * 100);
      const updated: AuditFinding = {
        ...demoTarget,
        milestones: updatedMilestones,
        progress,
        progressLabel: progress === 100 ? 'Review' : 'Active',
      };
      setDemoFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      onNotify(`Updated milestone status for ${updated.id} (${completed}/${updatedMilestones.length} complete).`);
      return;
    }

    if (ms.rawActionStatus === 'Verified') {
      onNotify(`${ms.code || 'Action'} is already Auditor-Verified and locked.`);
      return;
    }

    const nextStatus: ActionStatusLiteral =
      ms.rawActionStatus === 'Submitted' ? 'In Progress' : 'Submitted';
    const nextProgress = nextStatus === 'Submitted' ? 100 : 50;

    setSubmitting(true);
    try {
      await apiClient.put<CorrectiveActionOut>(`/actions/${ms.id}`, {
        status: nextStatus,
        progress_percent: nextProgress,
      });
      onNotify(
        `Updated ${ms.code || 'corrective action'} -> ${nextStatus} (${nextProgress}%).`
      );
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to update corrective action.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAction = async (ms: UnifiedMilestone, decision: 'Verified' | 'Rejected') => {
    if (!canVerifyActions || mode !== 'api') return;
    setSubmitting(true);
    try {
      await apiClient.put<CorrectiveActionOut>(`/actions/${ms.id}`, {
        status: decision,
        progress_percent: decision === 'Verified' ? 100 : 25,
      });
      onNotify(`Corrective action ${ms.code} marked ${decision}.`);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Verification request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding || !canManageSelectedActions || !actionTitle.trim()) return;

    if (mode === 'demo') {
      const target = demoFindings.find((f) => f.id === selectedFinding.id);
      if (!target) return;
      const newStep = {
        id: `${target.id}-${target.milestones.length + 1}`,
        step: target.milestones.length + 1,
        title: `${target.milestones.length + 1}. ${actionTitle.trim()}`,
        detail: actionDetail.trim() || `Due ${actionDueDate}`,
        status: 'active' as const,
      };
      setDemoFindings((prev) =>
        prev.map((f) =>
          f.id === target.id ? { ...f, milestones: [...f.milestones, newStep] } : f
        )
      );
      setActionTitle('');
      setActionDetail('');
      setAddActionOpen(false);
      onNotify(`Added corrective action milestone to ${target.id} (Demo).`);
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiClient.post<CorrectiveActionOut>('/actions', {
        finding_id: selectedFinding.id,
        title: actionTitle.trim(),
        detail: actionDetail.trim() || null,
        step_order: selectedFinding.milestones.length + 1,
        due_date: actionDueDate,
        status: 'In Progress',
        progress_percent: 25,
      });
      setActionTitle('');
      setActionDetail('');
      setAddActionOpen(false);
      onNotify(`Created corrective action ${created.code} on ${selectedFinding.code}.`);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to create corrective action.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding || !canCreateFinding || !recTitle.trim() || !recGuidance.trim()) return;
    if (mode !== 'api') {
      onNotify('Recommendations persistence requires PostgreSQL API mode.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post<RecommendationOut>('/recommendations', {
        finding_id: selectedFinding.id,
        title: recTitle.trim(),
        guidance: recGuidance.trim(),
        priority: recPriority,
      });
      setRecTitle('');
      setRecGuidance('');
      setAddRecOpen(false);
      onNotify(`Issued formal audit recommendation on ${selectedFinding.code}.`);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to create recommendation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespondRecommendation = async (recId: string) => {
    if (!recResponseText.trim() || mode !== 'api') return;
    setSubmitting(true);
    try {
      await apiClient.post(`/recommendations/${recId}/respond`, {
        management_response: recResponseText.trim(),
        accepted_by_management: true,
      });
      setRespondingRecId(null);
      setRecResponseText('');
      onNotify('Management response recorded & accepted.');
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to submit management response.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimarySignoffAction = async () => {
    if (!selectedFinding) return;

    if (mode === 'demo') {
      if (!canSignOff && !canSubmitForVerification) {
        onNotify('Only Admin, Management, or Auditor roles can advance verification sign-off.');
        return;
      }
      setDemoFindings((prev) =>
        prev.map((f) =>
          f.id === selectedFinding.id
            ? {
                ...f,
                status: canSignOff ? 'Closed' : 'Verification Pending',
                progress: 100,
                progressLabel: canSignOff ? 'Completed' : 'Review',
                actionType: 'Verify',
              }
            : f
        )
      );
      onNotify(
        canSignOff
          ? `CAO sign-off closed ${selectedFinding.code} (Demo).`
          : `Submitted ${selectedFinding.code} for CAO verification sign-off (Demo).`
      );
      return;
    }

    if (selectedFinding.status === 'Closed') return;

    setSubmitting(true);
    try {
      if (canSignOff) {
        await apiClient.put(`/findings/${selectedFinding.id}`, {
          sign_off: true,
          management_response:
            selectedFinding.managementResponse ||
            'Executive CAO sign-off recorded upon verification of corrective controls.',
        });
        onNotify(`Authorized CAO sign-off and closed ${selectedFinding.code} in PostgreSQL.`);
      } else if (canSubmitForVerification) {
        await apiClient.put(`/findings/${selectedFinding.id}`, {
          status: 'Verification Pending',
        });
        onNotify(`Submitted ${selectedFinding.code} to CAO / Management verification queue.`);
      }
      await fetchFindingsData();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Sign-off action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveManagementNote = async () => {
    if (!selectedFinding || !noteInput.trim()) return;

    if (mode === 'demo') {
      onNotify(`Appended fiduciary management response note to ${selectedFinding.code} (Demo).`);
      setNoteInput('');
      setNoteModalOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.put(`/findings/${selectedFinding.id}`, {
        management_response: noteInput.trim(),
      });
      onNotify(`Saved management response note to ${selectedFinding.code}.`);
      setNoteInput('');
      setNoteModalOpen(false);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to save management note.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding || !canRejectVerification) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      onNotify('Provide a clear rejection reason of at least 3 characters.');
      return;
    }

    if (mode === 'demo') {
      setDemoFindings((prev) =>
        prev.map((f) =>
          f.id === selectedFinding.id
            ? {
                ...f,
                status: 'In Progress',
                progressLabel: 'Active',
                actionType: 'Update',
              }
            : f
        )
      );
      setRejectReason('');
      setRejectModalOpen(false);
      onNotify(`Verification rejected for ${selectedFinding.code}; returned to In Progress (Demo).`);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.put<FindingOut>(`/findings/${selectedFinding.id}`, {
        status: 'In Progress',
        rejection_reason: reason,
      });
      setRejectReason('');
      setRejectModalOpen(false);
      onNotify(`Rejected verification & reopened ${selectedFinding.code} to In Progress.`);
      await fetchFindingsData();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to reject verification.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFinding = async () => {
    if (!selectedFinding || !canDeleteFinding || selectedFinding.status === 'Closed') return;

    if (mode === 'demo') {
      setDemoFindings((prev) => prev.filter((f) => f.id !== selectedFinding.id));
      setConfirmDeleteFinding(false);
      setDrawerOpen(false);
      onNotify(`Deleted non-closed finding ${selectedFinding.code} (Demo).`);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.delete(`/findings/${selectedFinding.id}`);
      const deletedCode = selectedFinding.code;
      setConfirmDeleteFinding(false);
      setDrawerOpen(false);
      onNotify(`Deleted non-closed finding ${deletedCode}.`);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to delete finding.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAction = async (ms: UnifiedMilestone) => {
    if (!canDeleteFinding || ms.rawActionStatus === 'Verified') return;

    if (mode === 'demo' || !selectedFinding) {
      if (selectedFinding) {
        setDemoFindings((prev) =>
          prev.map((f) =>
            f.id === selectedFinding.id
              ? { ...f, milestones: f.milestones.filter((m) => m.id !== ms.id) }
              : f
          )
        );
      }
      setConfirmDeleteActionId(null);
      onNotify('Deleted corrective action milestone (Demo).');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.delete(`/actions/${ms.id}`);
      setConfirmDeleteActionId(null);
      onNotify(`Deleted corrective action ${ms.code || ms.title}.`);
      await fetchFindingsData();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to delete corrective action.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadEvidence = async (ev: UnifiedEvidenceItem) => {
    if (mode === 'demo' || !ev.id) {
      onNotify(`Verified SHA-256 artifact checksum for ${ev.filename}.`);
      return;
    }
    try {
      const { blob, filename, sha256 } = await apiClient.downloadBlob(`/evidence/${ev.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(
        `Verified & downloaded ${filename}${sha256 ? ` (SHA-256: ${sha256.slice(0, 12)}...)` : ''}.`
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Evidence download failed.');
    }
  };

  const handleExportRegister = () => {
    auditService.exportCsvRows(
      'CompanyAudit_Findings_Corrective_Actions.csv',
      ['Finding Code', 'Title', 'Department', 'Severity', 'Owner', 'Target SLA', 'Progress', 'Status'],
      filteredFindings.map((f) => [
        f.code,
        f.title,
        f.department,
        f.severity,
        f.owner.name,
        f.targetSla,
        `${f.progress}%`,
        f.status,
      ])
    );
    onNotify(`Exported ${filteredFindings.length} audit findings & corrective actions.`);
  };

  const handleLogFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateFinding || !newFindingTitle.trim()) return;

    if (mode === 'demo') {
      const nextId = `FND-${1025 + demoFindings.length}`;
      const created: AuditFinding = {
        id: nextId,
        title: newFindingTitle.trim(),
        shortTitle: newFindingTitle.trim(),
        rootCauseShort: newFindingRootCause.trim() || 'Control exception identified during fieldwork',
        rootCauseDetailed:
          newFindingRootCause.trim() ||
          `Control deviation logged for ${newFindingTitle.trim()}. Remediation owner assigned.`,
        department: newFindingDeptDemo,
        workstream: newFindingWorkstream.trim() || `${newFindingDeptDemo} Governance`,
        severity: newFindingSeverity,
        tierLabel: newFindingSeverity === 'Critical' ? 'Tier 1 Critical' : `${newFindingSeverity} Risk`,
        owner: {
          name: 'Marcus Chen',
          initials: 'MC',
          avatarBg: 'bg-primary-container text-white',
        },
        leadAuditor: user?.full_name || 'Eleanor Vance',
        targetSla: newFindingSlaDate,
        slaCountdown: 'In 18 Days',
        progress: 15,
        progressLabel: 'Active',
        status: 'Open',
        actionType: 'Update',
        evidence: [{ filename: 'fieldwork_control_trace.log', meta: '1.2 MB • SHA-256', icon: 'terminal' }],
        milestones: [
          {
            id: `${nextId}-1`,
            step: 1,
            title: '1. Root cause confirmation & owner acknowledgement',
            detail: 'Logged in Q4 Governance Register',
            status: 'active',
          },
        ],
      };
      setDemoFindings((prev) => [created, ...prev]);
      setSelectedFindingId(nextId);
      setNewFindingTitle('');
      setNewFindingRootCause('');
      setLogFindingOpen(false);
      setDrawerOpen(true);
      onNotify(`Logged new audit finding ${nextId} (Demo).`);
      return;
    }

    if (!newFindingAuditId || !newFindingDeptId) {
      onNotify('Select both target Audit Engagement and Department.');
      return;
    }
    if (newFindingRootCause.trim().length < 5) {
      onNotify('Provide a root cause narrative of at least 5 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiClient.post<FindingOut>('/findings', {
        audit_id: newFindingAuditId,
        department_id: newFindingDeptId,
        owner_user_id: newFindingOwnerId || null,
        title: newFindingTitle.trim(),
        root_cause: newFindingRootCause.trim(),
        workstream: newFindingWorkstream.trim() || null,
        severity: newFindingSeverity,
        status: 'Open',
        target_sla_date: newFindingSlaDate,
      });
      setNewFindingTitle('');
      setNewFindingRootCause('');
      setNewFindingWorkstream('');
      setLogFindingOpen(false);
      setSelectedFindingId(created.id);
      setDrawerOpen(true);
      onNotify(`Logged finding ${created.code} in PostgreSQL register.`);
      await fetchFindingsData();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to create finding.');
    } finally {
      setSubmitting(false);
    }
  };

  const completedMilestoneCount = selectedFinding
    ? selectedFinding.milestones.filter((m) => m.status === 'completed').length
    : 0;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Standardized Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Governance & Oversight', to: '/dashboard' },
          { label: 'Findings & Remediation' },
        ]}
        title="Audit Findings & Corrective Action Plans"
        description="Track audit deviations, execute remediation milestones, and verify corrective closures with append-only cryptographic audit trails."
        actions={
          <>
            {selectedFinding && (
              <button
                type="button"
                onClick={() => openFindingDrawer(selectedFinding.id)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-low text-secondary border border-secondary/30 hover:bg-surface-container transition-colors text-label-lg"
              >
                <Eye className="w-4 h-4" />
                <span>Inspect {selectedFinding.code}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportRegister}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest text-on-surface border border-border-hairline shadow-exec-sm hover:bg-surface-container-low transition-colors text-label-lg"
            >
              <Download className="w-4 h-4 text-secondary" />
              <span>Export Register</span>
            </button>
            <button
              type="button"
              disabled={!canCreateFinding}
              onClick={() => setLogFindingOpen(true)}
              title={canCreateFinding ? 'Log a new audit finding' : 'Admin or Auditor role required'}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary shadow-exec-sm hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-label-lg"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Log Audit Finding</span>
            </button>
          </>
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Balanced 4-Card KPI Row (Live Computed Metrics) */}
      <section aria-label="Findings Key Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          eyebrow="Open Findings"
          badgeText="Requires Resolution"
          badgeTone="danger"
          leftAccentClass="bg-error"
          value={String(metrics.openCount)}
          footerLeft={
            <span className="font-semibold text-on-surface">
              {metrics.critOpen} Critical • {metrics.highOpen} High Priority
            </span>
          }
          footerRight={<Flag className="w-4 h-4 text-error" />}
        />

        <KpiCard
          eyebrow="In Flight Actions"
          badgeText="Active Execution"
          badgeTone="secondary"
          badgeIcon={<RefreshCw className="w-3.5 h-3.5" />}
          leftAccentClass="bg-secondary"
          value={String(metrics.inFlightActions)}
          footerLeft={
            <span>
              {metrics.completedActions} completed,{' '}
              <strong className="text-on-surface">{metrics.verificationCount} awaiting verify</strong>
            </span>
          }
          footerRight={<Timer className="w-4 h-4 text-secondary" />}
        />

        <KpiCard
          eyebrow="Overdue Findings"
          badgeText={metrics.overdueCount > 0 ? 'SLA Breached' : 'Within SLA'}
          badgeTone={metrics.overdueCount > 0 ? 'danger' : 'success'}
          badgeIcon={<AlertTriangle className="w-3.5 h-3.5" />}
          leftAccentClass={metrics.overdueCount > 0 ? 'bg-error' : 'bg-secondary'}
          value={String(metrics.overdueCount)}
          valueClassName={metrics.overdueCount > 0 ? 'text-error' : 'text-on-surface'}
          footerLeft={
            <span className={metrics.overdueCount > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}>
              {metrics.overdueCount > 0
                ? `${metrics.overdueCount} past target SLA date`
                : 'All active findings within SLA window'}
            </span>
          }
          footerRight={<BellRing className={`w-4 h-4 ${metrics.overdueCount > 0 ? 'text-error' : 'text-secondary'}`} />}
        />

        <KpiCard
          eyebrow="SLA Compliance Rate"
          badgeText={`${metrics.closedCount} Closed`}
          badgeTone="info"
          badgeIcon={<TrendingUp className="w-3.5 h-3.5" />}
          leftAccentClass="bg-secondary-container"
          value={`${metrics.velocity}%`}
          footerLeft="SLA Target: 85%"
          footerRight={<span className="font-semibold text-secondary">Verified Posture</span>}
          progress={metrics.velocity}
        />
      </section>

      {/* Dedicated Filter Toolbar Section */}
      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setPage(1);
        }}
        searchPlaceholder="Search findings by code, title, root cause, or owner..."
        activeFilterCount={activeFilterCount}
        onReset={resetAllFilters}
        rightActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSlaAtRiskOnly((prev) => !prev);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg text-label-md transition-colors ${
                slaAtRiskOnly
                  ? 'bg-error text-on-error font-bold'
                  : 'bg-surface-container-lowest text-error border border-border-hairline hover:bg-error-container/50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>SLA At Risk</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMyActionsOnly((prev) => !prev);
                setPage(1);
              }}
              className={`h-10 px-3.5 rounded-lg text-label-md transition-colors ${
                myActionsOnly
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'bg-surface-container-lowest text-on-surface border border-border-hairline hover:bg-surface-container-low'
              }`}
            >
              My Actions
            </button>
          </div>
        }
      >
        <select
          value={departmentFilter}
          onChange={(e) => {
            setDepartmentFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by department"
          className="h-10 bg-surface-container-low/70 text-on-surface text-body-sm rounded-lg px-3.5 border border-border-hairline focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All Departments">All Departments</option>
          {departmentFilterOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value as FindingSeverity | 'All');
            setPage(1);
          }}
          aria-label="Filter by severity"
          className="h-10 bg-surface-container-low/70 text-on-surface text-body-sm rounded-lg px-3.5 border border-border-hairline focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">Severity: All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as FindingStatus | 'All');
            setPage(1);
          }}
          aria-label="Filter by status"
          className="h-10 bg-surface-container-low/70 text-on-surface text-body-sm rounded-lg px-3.5 border border-border-hairline focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">Status: All</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Verification Pending">Verification Pending</option>
          <option value="Overdue">Overdue</option>
          <option value="Closed">Closed</option>
        </select>
      </FilterToolbar>

      {/* Primary Register Container */}
      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden flex flex-col">
        {/* Register Tabs & View Switcher */}
        <div className="px-6 py-4 bg-surface-container-low/50 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'all', label: `All Findings (${metrics.total})` },
                { id: 'action-plan', label: `Action Plan (${metrics.openCount})` },
                { id: 'verification', label: `Awaiting Verification (${metrics.verificationCount})` },
                { id: 'closed', label: `Closed & Verified (${metrics.closedCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                }}
                className={`px-3.5 py-2 rounded-lg text-label-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'font-bold bg-surface-container-lowest text-primary shadow-exec-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-label-sm text-outline uppercase tracking-wider">Layout:</span>
            <div className="inline-flex items-center p-1 rounded-lg bg-surface-container-lowest border border-border-hairline">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <TableProperties className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                aria-label="Kanban view"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-secondary text-on-secondary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Kanban className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {mode === 'api' && loading && unifiedFindings.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading findings from PostgreSQL...</div>
        ) : filteredFindings.length === 0 ? (
          <EmptyState
            title="No matching audit findings"
            description="No findings match your active tab, search query, or SLA filters. Reset filters to view the full register."
            actionLabel="Reset All Filters"
            onAction={() => {
              setActiveTab('all');
              resetAllFilters();
            }}
          />
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-surface-container-low/70 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Finding Code</th>
                  <th className="py-3.5 px-5 font-semibold">Deviation &amp; Root Cause</th>
                  <th className="py-3.5 px-5 font-semibold">Department</th>
                  <th className="py-3.5 px-5 font-semibold">Severity</th>
                  <th className="py-3.5 px-5 font-semibold">Action Owner</th>
                  <th className="py-3.5 px-5 font-semibold">Remediation SLA</th>
                  <th className="py-3.5 px-5 font-semibold">Progress</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-body-sm text-on-surface">
                {pagedFindings.map((item) => {
                  const isSelected = selectedFinding?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openFindingDrawer(item.id)}
                      className={`transition-colors cursor-pointer group ${
                        isSelected
                          ? 'bg-surface-container-low/80 border-l-4 border-l-secondary'
                          : 'hover:bg-surface-container-low/50'
                      }`}
                    >
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md font-mono text-label-sm font-bold ${
                            isSelected
                              ? 'text-on-secondary bg-secondary shadow-exec-sm'
                              : 'text-secondary bg-surface-container-high'
                          }`}
                        >
                          {item.code}
                        </span>
                      </td>
                      <td className="py-4 px-5 max-w-sm">
                        <div className="flex flex-col">
                          <span
                            title={item.title}
                            className="text-headline-sm font-semibold text-on-surface line-clamp-1 group-hover:text-secondary transition-colors"
                          >
                            {item.shortTitle}
                          </span>
                          <span className="text-body-sm text-on-surface-variant mt-0.5 line-clamp-1">
                            {item.rootCauseShort}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className="text-body-sm font-medium text-on-surface-variant">{item.department}</span>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <StatusBadge
                          dot
                          tone={
                            item.severity === 'Critical'
                              ? 'danger'
                              : item.severity === 'High'
                                ? 'secondary'
                                : item.severity === 'Medium'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {item.severity}
                        </StatusBadge>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full ${item.owner.avatarBg} flex items-center justify-center font-mono text-label-sm font-bold shrink-0`}
                          >
                            {item.owner.initials}
                          </div>
                          <span className="text-body-sm font-medium text-on-surface">{item.owner.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span
                            className={`font-mono text-data-mono tabular-nums ${
                              item.isOverdue ? 'text-error font-semibold' : 'text-on-surface'
                            }`}
                          >
                            {item.targetSla}
                          </span>
                          <span
                            className={`text-label-sm flex items-center gap-1 mt-0.5 ${
                              item.isOverdue
                                ? 'text-error font-bold'
                                : item.slaCountdown === 'Pending Sign-off'
                                  ? 'text-secondary font-semibold'
                                  : 'text-outline'
                            }`}
                          >
                            {item.isOverdue && <AlertTriangle className="w-3.5 h-3.5" />}
                            {item.slaCountdown}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 w-28">
                          <div className="flex justify-between text-label-sm tabular-nums">
                            <span
                              className={`font-bold ${
                                item.isOverdue
                                  ? 'text-error'
                                  : item.progressLabel === 'Review' || isSelected
                                    ? 'text-secondary'
                                    : 'text-on-surface'
                              }`}
                            >
                              {item.progress}%
                            </span>
                            <span
                              className={
                                item.isOverdue
                                  ? 'text-error font-medium'
                                  : item.progressLabel === 'Review'
                                    ? 'text-secondary font-semibold'
                                    : 'text-outline'
                              }
                            >
                              {item.progressLabel}
                            </span>
                          </div>
                          <ProgressBar
                            value={item.progress}
                            heightClass="h-1.5"
                            fillClass={item.isOverdue ? 'bg-error' : 'bg-secondary'}
                          />
                        </div>
                      </td>
                      <td
                        className="py-4 px-6 text-right whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFindingDrawer(item.id, 'milestones');
                        }}
                      >
                        <button
                          type="button"
                          className={`px-3.5 py-1.5 rounded-lg text-label-md transition-colors ${
                            item.actionType === 'Verify' || isSelected
                              ? 'bg-secondary text-on-secondary hover:bg-secondary-container'
                              : 'bg-surface-container-high text-on-surface hover:bg-surface-container'
                          }`}
                        >
                          {item.actionType}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Kanban Board View */
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {(['Open', 'In Progress', 'Overdue', 'Verification Pending'] as FindingStatus[]).map((lane) => (
              <div
                key={lane}
                className="bg-surface-container-low/80 rounded-xl p-4 space-y-3 border border-border-hairline/60"
              >
                <div className="flex items-center justify-between pb-2 border-b border-surface-container">
                  <span className="text-label-md uppercase tracking-wider text-on-surface font-bold">{lane}</span>
                  <span className="font-mono text-label-sm bg-surface-container-lowest px-2.5 py-0.5 rounded-md border border-border-hairline font-bold">
                    {filteredFindings.filter((f) => f.status === lane).length}
                  </span>
                </div>
                <div className="space-y-3">
                  {filteredFindings
                    .filter((f) => f.status === lane)
                    .map((card) => (
                      <div
                        key={card.id}
                        onClick={() => openFindingDrawer(card.id)}
                        className="bg-surface-container-lowest p-4 rounded-xl border border-border-hairline shadow-exec-sm cursor-pointer hover:border-secondary transition-colors space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-label-sm font-bold text-secondary">{card.code}</span>
                          <StatusBadge tone={card.severity === 'Critical' ? 'danger' : 'secondary'}>
                            {card.severity}
                          </StatusBadge>
                        </div>
                        <div className="text-headline-sm text-on-surface font-semibold leading-snug">{card.title}</div>
                        <div className="text-body-sm text-outline">
                          {card.owner.name} • {card.targetSla}
                        </div>
                        <ProgressBar value={card.progress} heightClass="h-1.5" />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-surface-container-low/40 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant text-body-sm">
          <div className="flex items-center flex-wrap gap-2">
            <span>
              Showing <strong className="text-on-surface font-semibold">{pagedFindings.length}</strong> of{' '}
              <strong className="text-on-surface font-semibold">{filteredFindings.length}</strong> matching findings (
              {metrics.total} total in register)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg bg-surface-container-lowest border border-border-hairline text-on-surface disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pg) => (
              <button
                key={pg}
                type="button"
                onClick={() => setPage(pg)}
                className={`w-8 h-8 rounded-lg text-label-md font-bold flex items-center justify-center transition-colors ${
                  page === pg
                    ? 'bg-secondary text-on-secondary'
                    : 'bg-surface-container-lowest border border-border-hairline hover:bg-surface-container text-on-surface'
                }`}
              >
                {pg}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-lg bg-surface-container-lowest border border-border-hairline hover:bg-surface-container text-on-surface disabled:opacity-40 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progressive Disclosure Slide-Over Inspection Drawer */}
      {selectedFinding && (
        <SlideOverDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          widthClass="max-w-xl"
          eyebrow={
            <>
              <span className="font-mono text-label-md text-secondary font-bold">{selectedFinding.code}</span>
              <StatusBadge tone={selectedFinding.severity === 'Critical' ? 'danger' : 'secondary'}>
                {selectedFinding.tierLabel}
              </StatusBadge>
              <StatusBadge tone={selectedFinding.status === 'Closed' ? 'success' : 'info'}>
                {selectedFinding.status}
              </StatusBadge>
            </>
          }
          title={selectedFinding.title}
          subtitle={`${selectedFinding.workstream} • Assigned to ${selectedFinding.owner.name}`}
          footer={
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={
                  submitting ||
                  selectedFinding.status === 'Closed' ||
                  (!canSignOff &&
                    (!canSubmitForVerification || selectedFinding.status === 'Verification Pending'))
                }
                onClick={handlePrimarySignoffAction}
                className="w-full h-10 px-4 rounded-lg bg-secondary text-on-secondary hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-label-lg flex items-center justify-center gap-2 shadow-exec-sm"
              >
                <BadgeCheck className="w-4 h-4" />
                <span>
                  {selectedFinding.status === 'Closed'
                    ? `Closed & Signed Off${selectedFinding.signedOffBy ? ` by ${selectedFinding.signedOffBy}` : ''}`
                    : canSignOff
                      ? 'Authorize CAO Sign-off & Close'
                      : canSubmitForVerification
                        ? selectedFinding.status === 'Verification Pending'
                          ? 'Awaiting CAO Sign-off'
                          : 'Submit for CAO Verification Sign-off'
                        : 'Requires Admin / Management Sign-off'}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!canRespondSelectedFinding}
                  onClick={() => {
                    setNoteInput(selectedFinding.managementResponse || '');
                    setNoteModalOpen(true);
                  }}
                  title={
                    canRespondSelectedFinding
                      ? 'Add or update management response'
                      : 'Restricted to authorized roles'
                  }
                  className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-border-hairline hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed text-on-surface text-label-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <FilePenLine className="w-4 h-4 text-secondary" />
                  <span>Management Note</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/audits/history');
                  }}
                  className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-border-hairline hover:bg-surface-container text-on-surface text-label-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <History className="w-4 h-4 text-secondary" />
                  <span>Audit Trail</span>
                </button>
              </div>

              {selectedFinding.status === 'Verification Pending' && canRejectVerification && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setRejectReason('');
                    setRejectModalOpen(true);
                  }}
                  className="w-full h-9 px-3 rounded-lg bg-error-container/50 border border-error/30 hover:bg-error-container text-error text-label-md font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reject Verification &amp; Reopen</span>
                </button>
              )}

              {canDeleteFinding && selectedFinding.status !== 'Closed' && (
                <div className="pt-1 border-t border-surface-container flex items-center justify-between gap-2">
                  {confirmDeleteFinding ? (
                    <>
                      <span className="text-label-sm text-error font-semibold">
                        Delete non-closed {selectedFinding.code}?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFinding(false)}
                          className="h-8 px-3 rounded-lg border border-border-hairline text-label-sm bg-surface-container-lowest"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleDeleteFinding()}
                          className="h-8 px-3 rounded-lg bg-error text-on-error text-label-sm font-semibold"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteFinding(true)}
                      className="w-full h-9 px-3 rounded-lg border border-error/25 text-error hover:bg-error-container/40 text-label-md transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Non-Closed Finding</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          }
        >
          {/* Drawer Sub-Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-border-hairline/70">
            {(
              [
                { id: 'overview', label: 'Overview & Root Cause' },
                {
                  id: 'milestones',
                  label: `Actions (${completedMilestoneCount}/${selectedFinding.milestones.length})`,
                },
                { id: 'evidence', label: `Evidence (${selectedFinding.evidence.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDrawerTab(tab.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-label-md transition-colors ${
                  drawerTab === tab.id
                    ? 'bg-surface-container-lowest text-primary font-bold shadow-exec-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {drawerTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-low/80 p-4 rounded-xl border border-border-hairline/70">
                <div>
                  <span className="text-label-sm text-outline block uppercase tracking-wider">
                    Scope / Workstream
                  </span>
                  <span className="text-headline-sm font-semibold text-on-surface mt-0.5 block">
                    {selectedFinding.workstream}
                  </span>
                </div>
                <div>
                  <span className="text-label-sm text-outline block uppercase tracking-wider">Target SLA</span>
                  <span className="font-mono text-headline-sm font-bold text-secondary mt-0.5 block">
                    {selectedFinding.targetSla} ({selectedFinding.slaCountdown})
                  </span>
                </div>
                <div>
                  <span className="text-label-sm text-outline block uppercase tracking-wider">Lead Auditor</span>
                  <span className="text-headline-sm font-medium text-on-surface mt-0.5 block">
                    {selectedFinding.leadAuditor}
                  </span>
                </div>
                <div>
                  <span className="text-label-sm text-outline block uppercase tracking-wider">Assigned Owner</span>
                  <span className="text-headline-sm font-medium text-on-surface mt-0.5 block">
                    {selectedFinding.owner.name}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  <span>Root Cause Analysis</span>
                </span>
                <div className="bg-surface p-4 rounded-xl border border-border-hairline/70 text-body-md text-on-surface leading-relaxed">
                  {selectedFinding.rootCauseDetailed}
                </div>
              </div>

              {selectedFinding.rejectionReason && (
                <div className="p-4 rounded-xl bg-error-container/40 border border-error/30 space-y-1">
                  <span className="text-label-sm uppercase tracking-wider font-bold text-error flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Previous Verification Rejected &amp; Reopened</span>
                  </span>
                  <p className="text-body-sm text-on-surface">{selectedFinding.rejectionReason}</p>
                </div>
              )}

              {selectedFinding.managementResponse && (
                <div className="space-y-1.5">
                  <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant">
                    Management Response
                  </span>
                  <div className="bg-surface-container-low/70 p-4 rounded-xl border border-border-hairline text-body-sm text-on-surface">
                    {selectedFinding.managementResponse}
                  </div>
                </div>
              )}

              {/* Recommendations Block (API Mode) */}
              {mode === 'api' && (
                <div className="space-y-2.5 pt-2 border-t border-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant">
                      Auditor Recommendations ({selectedFinding.recommendations.length})
                    </span>
                    {canCreateFinding && (
                      <button
                        type="button"
                        onClick={() => setAddRecOpen((prev) => !prev)}
                        className="inline-flex items-center gap-1 text-label-sm text-secondary font-semibold hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Issue Recommendation</span>
                      </button>
                    )}
                  </div>

                  {addRecOpen && (
                    <form
                      onSubmit={handleCreateRecommendation}
                      className="p-3.5 rounded-xl bg-surface-container-low border border-border-hairline space-y-2.5"
                    >
                      <input
                        type="text"
                        required
                        minLength={3}
                        value={recTitle}
                        onChange={(e) => setRecTitle(e.target.value)}
                        placeholder="Recommendation title..."
                        className="w-full h-9 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                      />
                      <textarea
                        rows={2}
                        required
                        minLength={5}
                        value={recGuidance}
                        onChange={(e) => setRecGuidance(e.target.value)}
                        placeholder="Control remediation guidance..."
                        className="w-full p-2.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={recPriority}
                          onChange={(e) => setRecPriority(e.target.value as SeverityLiteral)}
                          className="h-8 px-2.5 rounded-lg border border-border-hairline text-label-sm bg-surface-container-lowest"
                        >
                          <option value="Critical">Critical Priority</option>
                          <option value="High">High Priority</option>
                          <option value="Medium">Medium Priority</option>
                          <option value="Low">Low Priority</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAddRecOpen(false)}
                            className="h-8 px-3 rounded-lg border border-border-hairline text-label-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submitting}
                            className="h-8 px-3 rounded-lg bg-secondary text-on-secondary text-label-sm"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {selectedFinding.recommendations.length === 0 ? (
                    <p className="text-body-sm text-outline">No formal recommendations issued yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedFinding.recommendations.map((rec) => (
                        <div
                          key={rec.id}
                          className="p-3.5 rounded-xl bg-surface-container-low/60 border border-border-hairline/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-label-lg font-semibold text-on-surface">{rec.title}</span>
                            <StatusBadge tone={rec.accepted_by_management ? 'success' : 'neutral'}>
                              {rec.accepted_by_management ? 'Accepted' : rec.priority}
                            </StatusBadge>
                          </div>
                          <p className="text-body-sm text-on-surface-variant">{rec.guidance}</p>
                          {rec.management_response && (
                            <p className="text-label-sm text-secondary bg-surface-container-lowest p-2 rounded-lg border border-border-hairline/70">
                              Mgmt Response: {rec.management_response}
                            </p>
                          )}
                          {!rec.accepted_by_management &&
                            (hasRole('Admin', 'Management') ||
                              (hasRole('Department Head') &&
                                user?.department_id === selectedFinding.departmentId)) && (
                              <div className="pt-1">
                                {respondingRecId === rec.id ? (
                                  <div className="flex gap-2 mt-1">
                                    <input
                                      type="text"
                                      value={recResponseText}
                                      onChange={(e) => setRecResponseText(e.target.value)}
                                      placeholder="Commit remediation response..."
                                      className="flex-1 h-8 px-2.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRespondRecommendation(rec.id)}
                                      disabled={submitting}
                                      className="h-8 px-3 rounded-lg bg-secondary text-on-secondary text-label-sm"
                                    >
                                      Accept
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setRespondingRecId(rec.id)}
                                    className="inline-flex items-center gap-1 text-label-sm text-secondary font-semibold hover:underline"
                                  >
                                    <MessageSquarePlus className="w-3.5 h-3.5" />
                                    <span>Accept &amp; Respond</span>
                                  </button>
                                )}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline/70 space-y-2">
                <div className="flex items-center justify-between text-label-md">
                  <span className="text-on-surface font-semibold">Overall Remediation Completion</span>
                  <span className="font-mono font-bold text-secondary tabular-nums">{selectedFinding.progress}%</span>
                </div>
                <ProgressBar value={selectedFinding.progress} heightClass="h-2" />
              </div>
            </div>
          )}

          {drawerTab === 'milestones' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-secondary" />
                  <span>Corrective Actions ({completedMilestoneCount}/{selectedFinding.milestones.length})</span>
                </span>
                {canManageSelectedActions && (
                  <button
                    type="button"
                    onClick={() => setAddActionOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-label-sm text-secondary font-semibold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Action</span>
                  </button>
                )}
              </div>

              {addActionOpen && (
                <form
                  onSubmit={handleCreateAction}
                  className="p-4 rounded-xl bg-surface-container-low border border-border-hairline space-y-3"
                >
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    placeholder="Corrective action milestone title..."
                    className="w-full h-9 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={actionDetail}
                      onChange={(e) => setActionDetail(e.target.value)}
                      placeholder="Technical execution detail"
                      className="h-9 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    />
                    <input
                      type="date"
                      required
                      value={actionDueDate}
                      onChange={(e) => setActionDueDate(e.target.value)}
                      className="h-9 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAddActionOpen(false)}
                      className="h-8 px-3 rounded-lg border border-border-hairline text-label-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-8 px-3 rounded-lg bg-secondary text-on-secondary text-label-sm"
                    >
                      Create Action
                    </button>
                  </div>
                </form>
              )}

              {selectedFinding.milestones.length === 0 ? (
                <div className="p-6 rounded-xl bg-surface-container-low/60 border border-border-hairline text-center text-body-sm text-on-surface-variant">
                  No corrective action milestones logged for this finding yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedFinding.milestones.map((ms) => (
                    <div
                      key={ms.id}
                      className={`p-4 rounded-xl border transition-colors space-y-2.5 ${
                        ms.status === 'active'
                          ? 'bg-surface-container-low border-secondary/50'
                          : ms.status === 'completed'
                            ? 'bg-surface border-border-hairline/60'
                            : 'bg-surface-container-lowest border-border-hairline/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          disabled={!canManageSelectedActions || submitting}
                          onClick={() => handleToggleOrAdvanceMilestone(ms)}
                          className="text-left flex items-start gap-3 flex-1 disabled:cursor-default"
                        >
                          {ms.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-secondary mt-0.5 shrink-0" />
                          ) : ms.status === 'active' ? (
                            <RefreshCw className="w-5 h-5 text-secondary mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-5 h-5 text-outline mt-0.5 shrink-0" />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`text-headline-sm font-semibold ${
                                ms.rawActionStatus === 'Verified'
                                  ? 'line-through text-on-surface-variant'
                                  : 'text-on-surface'
                              }`}
                            >
                              {ms.title}
                            </span>
                            <span
                              className={`text-body-sm ${
                                ms.status === 'active' ? 'text-secondary font-medium' : 'text-on-surface-variant'
                              }`}
                            >
                              {ms.detail}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {ms.rawActionStatus && (
                            <StatusBadge
                              tone={
                                ms.rawActionStatus === 'Verified'
                                  ? 'success'
                                  : ms.rawActionStatus === 'Rejected'
                                    ? 'danger'
                                    : ms.rawActionStatus === 'Submitted'
                                      ? 'secondary'
                                      : 'neutral'
                              }
                            >
                              {ms.rawActionStatus}
                            </StatusBadge>
                          )}
                          {canDeleteFinding && ms.rawActionStatus !== 'Verified' && (
                            confirmDeleteActionId === ms.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteActionId(null)}
                                  className="h-7 px-2 rounded border border-border-hairline text-label-sm"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => void handleDeleteAction(ms)}
                                  className="h-7 px-2 rounded bg-error text-on-error text-label-sm font-semibold"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteActionId(ms.id)}
                                title="Delete non-verified corrective action"
                                aria-label={`Delete action ${ms.code || ms.title}`}
                                className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/40 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {mode === 'api' &&
                        canVerifyActions &&
                        ms.rawActionStatus === 'Submitted' && (
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-hairline/60">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleVerifyAction(ms, 'Rejected')}
                              className="h-7 px-2.5 rounded-md border border-error/40 text-error hover:bg-error-container/50 text-label-sm font-semibold"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleVerifyAction(ms, 'Verified')}
                              className="h-7 px-3 rounded-md bg-secondary text-on-secondary hover:bg-secondary-container text-label-sm font-semibold"
                            >
                              Auditor Verify
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {drawerTab === 'evidence' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4 text-secondary" />
                  <span>SHA-256 Verified Evidence &amp; Workpapers</span>
                </span>
                <Link
                  to="/audits/evidence"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex items-center gap-1 text-label-sm text-secondary font-semibold hover:underline"
                >
                  <span>Upload in Vault</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
              {selectedFinding.evidence.length === 0 ? (
                <div className="p-6 rounded-xl bg-surface-container-low/60 border border-border-hairline text-center text-body-sm text-on-surface-variant">
                  No evidence artifacts linked directly to {selectedFinding.code}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedFinding.evidence.map((ev) => (
                    <button
                      key={ev.id || ev.filename}
                      type="button"
                      onClick={() => handleDownloadEvidence(ev)}
                      className="w-full flex items-center justify-between gap-3 bg-surface-container-low/80 border border-border-hairline p-4 rounded-xl hover:bg-surface-container transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {ev.icon === 'terminal' ? (
                          <Terminal className="w-5 h-5 text-secondary shrink-0" />
                        ) : (
                          <Shield className="w-5 h-5 text-secondary shrink-0" />
                        )}
                        <div className="flex flex-col truncate">
                          <span className="font-mono text-headline-sm font-semibold truncate text-on-surface">
                            {ev.filename}
                          </span>
                          <span className="text-body-sm text-on-surface-variant">{ev.meta}</span>
                        </div>
                      </div>
                      <StatusBadge tone={ev.verificationStatus === 'Pending Review' ? 'warning' : 'success'}>
                        {ev.verificationStatus || 'Verified'}
                      </StatusBadge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </SlideOverDrawer>
      )}

      {/* Reject Verification & Reopen Modal */}
      {rejectModalOpen && selectedFinding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-reject-finding"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setRejectModalOpen(false)} />
          <form
            onSubmit={handleRejectVerification}
            className="relative w-full max-w-md bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg p-6 z-10 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="modal-reject-finding" className="text-headline-md text-error font-bold flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                <span>Reject Verification — {selectedFinding.code}</span>
              </h3>
              <button type="button" onClick={() => setRejectModalOpen(false)} aria-label="Close reject modal">
                <X className="w-4 h-4 text-outline" />
              </button>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Specify the control deficiency or missing evidence. Returning this finding reopens it to{' '}
              <strong className="text-on-surface">In Progress</strong> and alerts the remediation owner.
            </p>
            <div>
              <label htmlFor="reject-reason-input" className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                Rejection Reason (min 3 characters)
              </label>
              <textarea
                id="reject-reason-input"
                rows={4}
                required
                minLength={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Uploaded key rotation screenshot predates control cutover; attach post-cutover IAM log."
                className="w-full p-3 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-error"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="h-9 px-4 rounded-lg border border-border-hairline text-label-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || rejectReason.trim().length < 3}
                className="h-9 px-4 rounded-lg bg-error text-on-error disabled:opacity-50 text-label-md font-semibold"
              >
                {submitting ? 'Reopening...' : 'Reject & Reopen Finding'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Management Note Modal */}
      {noteModalOpen && selectedFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setNoteModalOpen(false)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg p-6 z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-headline-md text-primary font-bold">
                Management Response — {selectedFinding.code}
              </h3>
              <button type="button" onClick={() => setNoteModalOpen(false)}>
                <X className="w-4 h-4 text-outline" />
              </button>
            </div>
            <textarea
              rows={4}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Enter management response, remediation commitment, or evidence note..."
              className="w-full p-3 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="h-9 px-4 rounded-lg border border-border-hairline text-label-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !noteInput.trim()}
                onClick={handleSaveManagementNote}
                className="h-9 px-4 rounded-lg bg-secondary text-on-secondary disabled:opacity-50 text-label-md"
              >
                {submitting ? 'Saving...' : 'Save Response'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log New Finding Modal */}
      {logFindingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setLogFindingOpen(false)} />
          <form
            onSubmit={handleLogFinding}
            className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <h3 className="text-headline-lg text-primary font-bold">Log Audit Finding</h3>
              <button type="button" onClick={() => setLogFindingOpen(false)}>
                <X className="w-5 h-5 text-outline" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {mode === 'api' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Audit Engagement
                    </label>
                    <select
                      required
                      value={newFindingAuditId}
                      onChange={(e) => {
                        const chosenId = e.target.value;
                        setNewFindingAuditId(chosenId);
                        const chosenAudit = audits.find((a) => a.id === chosenId);
                        if (chosenAudit) {
                          setNewFindingDeptId(chosenAudit.department_id);
                        }
                      }}
                      className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      {audits.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Department
                    </label>
                    <select
                      required
                      value={newFindingDeptId}
                      onChange={(e) => setNewFindingDeptId(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Finding Title</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={newFindingTitle}
                  onChange={(e) => setNewFindingTitle(e.target.value)}
                  placeholder="e.g. Privileged SSH Bastion Session Logging Gap"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Root Cause Narrative
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={5}
                  value={newFindingRootCause}
                  onChange={(e) => setNewFindingRootCause(e.target.value)}
                  placeholder="Detail control failure mechanism and evidence gap..."
                  className="w-full p-3 rounded-lg border border-border-hairline text-body-sm focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {mode === 'demo' ? (
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Department
                    </label>
                    <select
                      value={newFindingDeptDemo}
                      onChange={(e) => setNewFindingDeptDemo(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      <option value="Technology / SecOps">Technology / SecOps</option>
                      <option value="Finance / Treasury">Finance / Treasury</option>
                      <option value="Operations / EHS">Operations / EHS</option>
                      <option value="Human Resources">Human Resources</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Action Owner
                    </label>
                    <select
                      value={newFindingOwnerId}
                      onChange={(e) => setNewFindingOwnerId(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      <option value="">Default (Dept Head)</option>
                      {orgUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Severity</label>
                  <select
                    value={newFindingSeverity}
                    onChange={(e) => setNewFindingSeverity(e.target.value as FindingSeverity)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Target SLA Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newFindingSlaDate}
                    onChange={(e) => setNewFindingSlaDate(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLogFindingOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary disabled:opacity-50 text-label-lg"
              >
                {submitting ? 'Registering...' : 'Register Finding'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
