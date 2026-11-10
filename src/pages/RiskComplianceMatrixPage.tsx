import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Filter,
  History,
  LayoutGrid,
  MoreVertical,
  Send,
  ShieldAlert,
  ShieldPlus,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar } from '../components/ui/FilterToolbar';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import {
  ActionStatusLiteral,
  AuditOut,
  DashboardOverviewOut,
  DepartmentOut,
  FrameworkComplianceOut,
  PaginatedResponse,
  RiskCategoryLiteral,
  RiskDistributionOut,
  RiskOut,
  RiskStatusLiteral,
  SeverityLiteral,
} from '../types/api';
import { EnterpriseRisk, RiskSeverity, RiskStatus } from '../types/audit';

interface RiskComplianceMatrixPageProps {
  onNotify: (msg: string) => void;
}

const PROBABILITY_ROWS: { p: 5 | 4 | 3 | 2 | 1; label: string }[] = [
  { p: 5, label: '5 - Freq' },
  { p: 4, label: '4 - Lkly' },
  { p: 3, label: '3 - Poss' },
  { p: 2, label: '2 - Unlk' },
  { p: 1, label: '1 - Rare' },
];

const IMPACT_COLS: { i: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { i: 1, label: '1 - Insig' },
  { i: 2, label: '2 - Minor' },
  { i: 3, label: '3 - Mod' },
  { i: 4, label: '4 - Major' },
  { i: 5, label: '5 - Catast' },
];

// Aligned strictly with backend app/services/scoring.py classify_risk_severity:
// 1–4 Low, 5–9 Medium, 10–16 High, 17–25 Critical
export function classifyRiskBand(score: number): SeverityLiteral {
  if (score <= 4) return 'Low';
  if (score <= 9) return 'Medium';
  if (score <= 16) return 'High';
  return 'Critical';
}

function getCellTone(p: number, i: number): {
  level: SeverityLiteral;
  bgClass: string;
  numClass: string;
} {
  const score = p * i;
  const level = classifyRiskBand(score);
  if (level === 'Critical') {
    return { level, bgClass: 'bg-error-container', numClass: 'text-error font-bold' };
  }
  if (level === 'High') {
    return { level, bgClass: 'bg-surface-container-highest', numClass: 'text-secondary font-semibold' };
  }
  if (level === 'Medium') {
    return { level, bgClass: 'bg-surface-container-high', numClass: 'text-on-surface font-semibold' };
  }
  return { level, bgClass: 'bg-surface-container-low', numClass: 'text-on-surface-variant font-semibold' };
}

interface UnifiedRisk {
  id: string;
  code: string;
  title: string;
  scope: string;
  category: RiskCategoryLiteral;
  departmentId: string;
  departmentName: string;
  probability: number;
  impact: number;
  score: number;
  severity: RiskSeverity;
  residualProbability: number;
  residualImpact: number;
  residualScore: number;
  residualLevel: string;
  owner: {
    name: string;
    initials: string;
    role: string;
    avatarBg: string;
  };
  mitigationStrategy: string;
  narrative: string;
  affectedAssets: string[];
  escalation: string;
  nextReview: string;
  rawNextReviewDate: string | null;
  progress: number;
  status: RiskStatusLiteral;
  milestones: {
    id: string;
    code?: string;
    title: string;
    subtitle: string;
    completed: boolean;
    inProgress?: boolean;
    rawStatus?: ActionStatusLiteral;
  }[];
  frameworks: { code: string; name: string; description: string }[];
  auditLog: { timestamp: string; title: string; detail: string; tone: 'error' | 'secondary' | 'neutral' }[];
}

export const RiskComplianceMatrixPage: React.FC<RiskComplianceMatrixPageProps> = ({ onNotify }) => {
  const { mode, hasRole, user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();

  // API state
  const [apiRisks, setApiRisks] = useState<RiskOut[]>([]);
  const [distribution, setDistribution] = useState<RiskDistributionOut | null>(null);
  const [frameworkCompliance, setFrameworkCompliance] = useState<FrameworkComplianceOut[]>([]);
  const [departments, setDepartments] = useState<DepartmentOut[]>([]);
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Demo state
  const [demoRisks, setDemoRisks] = useState<EnterpriseRisk[]>(() => auditService.getRisks());

  // Filter & pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState<RiskSeverity | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<RiskStatusLiteral | 'All'>('All');
  const [exactCell, setExactCell] = useState<{ p: number; i: number } | null>(null);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Detail modal state
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'overview' | 'mitigation' | 'compliance' | 'audit'>('overview');
  const [reassessOpen, setReassessOpen] = useState(false);
  const [reassessProb, setReassessProb] = useState(3);
  const [reassessImpact, setReassessImpact] = useState(4);
  const [reassessResProb, setReassessResProb] = useState(2);
  const [reassessResImpact, setReassessResImpact] = useState(2);
  const [reassessStrategy, setReassessStrategy] = useState('');
  const [reassessEscalation, setReassessEscalation] = useState('');
  const [reassessNextReview, setReassessNextReview] = useState('');

  // Escalate Risk inline state
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateTarget, setEscalateTarget] = useState('Board Audit Committee');
  const [escalateNote, setEscalateNote] = useState('');

  // Create Risk modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createScope, setCreateScope] = useState('');
  const [createCategory, setCreateCategory] = useState<RiskCategoryLiteral>('Technology');
  const [createDeptId, setCreateDeptId] = useState('');
  const [createAuditId, setCreateAuditId] = useState('');
  const [createProb, setCreateProb] = useState(4);
  const [createImpact, setCreateImpact] = useState(4);
  const [createResProb, setCreateResProb] = useState(2);
  const [createResImpact, setCreateResImpact] = useState(2);
  const [createStrategy, setCreateStrategy] = useState('');
  const [createNarrative, setCreateNarrative] = useState('');
  const [createEscalation, setCreateEscalation] = useState('VP SecOps & Audit Committee');

  const canCreateOrReassess = hasRole('Admin', 'Auditor');
  const canUpdateTreatmentStatus = hasRole('Admin', 'Auditor', 'Management');
  const isManagementOnly = mode === 'api' && user?.role === 'Management';

  const fetchRisks = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [risksRes, distRes, deptRes, audRes, dashRes] = await Promise.all([
        apiClient.get<PaginatedResponse<RiskOut>>('/risks?limit=200'),
        apiClient.get<RiskDistributionOut>('/dashboard/risk-distribution'),
        apiClient.get<DepartmentOut[]>('/departments'),
        apiClient.get<PaginatedResponse<AuditOut>>('/audits?limit=100'),
        apiClient.get<DashboardOverviewOut>('/dashboard'),
      ]);
      setApiRisks(risksRes.items);
      setDistribution(distRes);
      setDepartments(deptRes);
      setAudits(audRes.items);
      setFrameworkCompliance(dashRes.framework_compliance ?? []);
      if (deptRes.length > 0) {
        setCreateDeptId((prev) => prev || deptRes[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load enterprise risk matrix.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchRisks();
  }, [fetchRisks]);

  const unifiedRisks: UnifiedRisk[] = useMemo(() => {
    if (mode === 'api') {
      return apiRisks.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        scope: r.scope_description,
        category: r.category,
        departmentId: r.department_id,
        departmentName: r.department_name,
        probability: r.probability,
        impact: r.impact,
        score: r.inherent_score,
        severity: classifyRiskBand(r.inherent_score),
        residualProbability: r.residual_probability ?? r.probability,
        residualImpact: r.residual_impact ?? r.impact,
        residualScore: r.residual_score,
        residualLevel: r.residual_level,
        owner: {
          name: r.owner_name,
          initials: r.owner_initials,
          role: r.owner_role,
          avatarBg: 'bg-primary-container text-on-primary',
        },
        mitigationStrategy: r.mitigation_strategy || 'Mitigation plan pending owner specification.',
        narrative: r.narrative || r.scope_description,
        affectedAssets: r.affected_assets.length > 0 ? r.affected_assets : [r.department_name],
        escalation: r.escalation_target || 'Audit Committee',
        nextReview: r.next_review_date || 'Q1 FY26',
        rawNextReviewDate: r.next_review_date || null,
        progress: r.progress_percent,
        status: r.status,
        milestones: r.corrective_actions.map((ca) => ({
          id: ca.id,
          code: ca.code,
          title: `${ca.code}: ${ca.title}`,
          subtitle: `${ca.status} (${ca.progress_percent}%) • Due ${ca.due_date}`,
          completed: ca.status === 'Verified' || ca.status === 'Submitted',
          inProgress: ca.status === 'In Progress',
          rawStatus: ca.status,
        })),
        frameworks: r.mapped_frameworks,
        auditLog: [
          {
            timestamp: new Date(r.updated_at).toLocaleString(),
            title: `Current Risk Posture: ${r.status}`,
            detail: `Inherent ${r.probability}×${r.impact}=${r.inherent_score} (${r.severity}); Residual score ${r.residual_score} (${r.residual_level}).`,
            tone: r.severity === 'Critical' ? 'error' : 'secondary',
          },
          {
            timestamp: new Date(r.created_at).toLocaleString(),
            title: `Registered in ${r.department_name} Scope`,
            detail: `Owner: ${r.owner_name} (${r.owner_role})${r.linked_audit_code ? ` • Linked Audit ${r.linked_audit_code}` : ''}.`,
            tone: 'neutral',
          },
        ],
      }));
    }

    return demoRisks.map((r) => {
      const score = r.probability * r.impact;
      return {
        id: r.id,
        code: r.id,
        title: r.title,
        scope: r.scope,
        category: r.category as RiskCategoryLiteral,
        departmentId: r.scope,
        departmentName: r.scope,
        probability: r.probability,
        impact: r.impact,
        score,
        severity: classifyRiskBand(score),
        residualProbability: Math.max(1, r.probability - 1),
        residualImpact: Math.max(1, r.impact - 1),
        residualScore: r.residualScore,
        residualLevel: classifyRiskBand(r.residualScore),
        owner: r.owner,
        mitigationStrategy: r.mitigationStrategy,
        narrative: r.narrative,
        affectedAssets: r.affectedAssets,
        escalation: r.escalation,
        nextReview: r.nextReview,
        rawNextReviewDate: null,
        progress: r.progress,
        status: r.status as RiskStatusLiteral,
        milestones: r.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          subtitle: m.subtitle,
          completed: m.completed,
          inProgress: m.inProgress,
        })),
        frameworks: r.frameworks,
        auditLog: r.auditLog,
      };
    });
  }, [mode, apiRisks, demoRisks]);

  const selectedRisk = useMemo(() => {
    if (!selectedRiskId) return null;
    return unifiedRisks.find((r) => r.id === selectedRiskId) ?? null;
  }, [unifiedRisks, selectedRiskId]);

  const severityCounts = useMemo(() => {
    if (mode === 'api' && distribution) {
      return {
        Critical: distribution.by_severity.Critical ?? 0,
        High: distribution.by_severity.High ?? 0,
        Medium: distribution.by_severity.Medium ?? 0,
        Low: distribution.by_severity.Low ?? 0,
      };
    }
    return {
      Critical: unifiedRisks.filter((r) => r.severity === 'Critical').length,
      High: unifiedRisks.filter((r) => r.severity === 'High').length,
      Medium: unifiedRisks.filter((r) => r.severity === 'Medium').length,
      Low: unifiedRisks.filter((r) => r.severity === 'Low').length,
    };
  }, [mode, distribution, unifiedRisks]);

  const activeFilterCount =
    (categoryFilter !== 'All' ? 1 : 0) +
    (severityFilter !== 'All' ? 1 : 0) +
    (statusFilter !== 'All' ? 1 : 0) +
    (exactCell ? 1 : 0);

  const filteredRisks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedRisks.filter((risk) => {
      const matchesQuery =
        !q ||
        risk.code.toLowerCase().includes(q) ||
        risk.title.toLowerCase().includes(q) ||
        risk.scope.toLowerCase().includes(q) ||
        risk.owner.name.toLowerCase().includes(q) ||
        risk.mitigationStrategy.toLowerCase().includes(q);
      const matchesCat = categoryFilter === 'All' || risk.category === categoryFilter;
      const matchesSev = severityFilter === 'All' || risk.severity === severityFilter;
      const matchesStat = statusFilter === 'All' || risk.status === statusFilter;
      const matchesCell =
        !exactCell || (risk.probability === exactCell.p && risk.impact === exactCell.i);
      return matchesQuery && matchesCat && matchesSev && matchesStat && matchesCell;
    });
  }, [unifiedRisks, searchQuery, categoryFilter, severityFilter, statusFilter, exactCell]);

  const totalPages = Math.max(1, Math.ceil(filteredRisks.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const pagedRisks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRisks.slice(start, start + pageSize);
  }, [filteredRisks, page]);

  const handleFilterBySeverity = (sev: RiskSeverity) => {
    setExactCell(null);
    setSeverityFilter(sev);
    setBannerText(`Severity Filter Applied: ${sev} Risks`);
    setPage(1);
  };

  const handleSelectMatrixCell = (p: number, i: number, level: RiskSeverity) => {
    setSeverityFilter('All');
    setExactCell({ p, i });
    setBannerText(`Matrix Cell Selected: Probability ${p} × Impact ${i} = ${p * i} (${level})`);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
    setSeverityFilter('All');
    setStatusFilter('All');
    setExactCell(null);
    setBannerText(null);
    setPage(1);
  };

  const openRiskModal = (risk: UnifiedRisk) => {
    setSelectedRiskId(risk.id);
    setModalTab('overview');
    setReassessOpen(false);
    setEscalateOpen(false);
    setReassessProb(risk.probability);
    setReassessImpact(risk.impact);
    setReassessResProb(risk.residualProbability);
    setReassessResImpact(risk.residualImpact);
    setReassessStrategy(risk.mitigationStrategy);
    setReassessEscalation(risk.escalation);
    setReassessNextReview(risk.rawNextReviewDate || '');
    setEscalateTarget(risk.escalation || 'Board Audit Committee');
    setEscalateNote('');
  };

  const handleCreateRiskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateOrReassess || !createTitle.trim() || createScope.trim().length < 5) return;

    const previewScore = createProb * createImpact;
    const previewSev = classifyRiskBand(previewScore);

    if (mode === 'demo') {
      const nextCode = `RSK-${41 + demoRisks.length}`;
      const toScale = (n: number): 1 | 2 | 3 | 4 | 5 =>
        (Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5);
      const demoCat: EnterpriseRisk['category'] =
        createCategory === 'Financial' ||
        createCategory === 'Compliance' ||
        createCategory === 'Operations'
          ? createCategory
          : 'Technology';
      const newDemo: EnterpriseRisk = {
        id: nextCode,
        title: createTitle.trim(),
        scope: createScope.trim(),
        category: demoCat,
        probability: toScale(createProb),
        impact: toScale(createImpact),
        score: previewScore,
        severity: previewSev,
        residualScore: createResProb * createResImpact,
        residualLevel: `${classifyRiskBand(createResProb * createResImpact)} Target`,
        owner: { name: 'Marcus Chen', initials: 'MC', role: 'Lead Auditor', avatarBg: 'bg-primary-container text-on-primary' },
        mitigationStrategy: createStrategy.trim() || 'Mitigation action plan scheduled.',
        status: 'Open',
        progress: 25,
        nextReview: 'Dec 15, 2025',
        escalation: createEscalation,
        narrative: createNarrative.trim() || createScope.trim(),
        affectedAssets: [createScope.trim()],
        frameworks: [
          { code: 'SOC 2', name: 'Trust Services Criteria', description: 'Mapped enterprise control risk.' },
        ],
        milestones: [],
        auditLog: [
          {
            timestamp: 'Just Now',
            title: `Registered ${nextCode} (${previewSev})`,
            detail: `Score ${previewScore} (${createProb}×${createImpact})`,
            tone: previewSev === 'Critical' ? 'error' : 'secondary',
          },
        ],
      };
      setDemoRisks((prev) => [newDemo, ...prev]);
      setCreateTitle('');
      setCreateScope('');
      setCreateStrategy('');
      setCreateNarrative('');
      setCreateOpen(false);
      setSelectedRiskId(nextCode);
      onNotify(`Registered risk ${nextCode} (${previewScore} ${previewSev}) [Demo].`);
      return;
    }

    if (!createDeptId) {
      onNotify('Select a department for this risk vector.');
      return;
    }

    setSaving(true);
    try {
      const created = await apiClient.post<RiskOut>('/risks', {
        department_id: createDeptId,
        linked_audit_id: createAuditId || null,
        title: createTitle.trim(),
        scope_description: createScope.trim(),
        category: createCategory,
        probability: createProb,
        impact: createImpact,
        residual_probability: createResProb,
        residual_impact: createResImpact,
        mitigation_strategy: createStrategy.trim() || null,
        narrative: createNarrative.trim() || null,
        escalation_target: createEscalation.trim() || null,
        status: 'Open',
      });
      setCreateTitle('');
      setCreateScope('');
      setCreateStrategy('');
      setCreateNarrative('');
      setCreateOpen(false);
      await fetchRisks();
      setSelectedRiskId(created.id);
      onNotify(`Registered ${created.code} (${created.inherent_score} ${created.severity}) in PostgreSQL.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to register risk.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReassessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRisk || !canUpdateTreatmentStatus) return;

    const newScore = reassessProb * reassessImpact;
    const newSev = classifyRiskBand(newScore);
    const newResScore = reassessResProb * reassessResImpact;
    const newResLevel = classifyRiskBand(newResScore);

    if (mode === 'demo') {
      const toScale = (n: number): 1 | 2 | 3 | 4 | 5 =>
        (Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5);
      setDemoRisks((prev) =>
        prev.map((r) =>
          r.id === selectedRisk.id
            ? {
                ...r,
                probability: canCreateOrReassess ? toScale(reassessProb) : r.probability,
                impact: canCreateOrReassess ? toScale(reassessImpact) : r.impact,
                score: canCreateOrReassess ? newScore : r.score,
                severity: canCreateOrReassess ? newSev : r.severity,
                residualScore: canCreateOrReassess ? newResScore : r.residualScore,
                residualLevel: canCreateOrReassess ? newResLevel : r.residualLevel,
                mitigationStrategy: canCreateOrReassess ? reassessStrategy : r.mitigationStrategy,
                escalation: reassessEscalation.trim() || r.escalation,
                nextReview: reassessNextReview || r.nextReview,
              }
            : r
        )
      );
      setReassessOpen(false);
      onNotify(`Re-assessed ${selectedRisk.code} -> ${reassessProb}×${reassessImpact}=${newScore} (${newSev}) [Demo].`);
      return;
    }

    setSaving(true);
    try {
      const payload = isManagementOnly
        ? {
            escalation_target: reassessEscalation.trim() || null,
            next_review_date: reassessNextReview || null,
          }
        : {
            probability: reassessProb,
            impact: reassessImpact,
            residual_probability: reassessResProb,
            residual_impact: reassessResImpact,
            mitigation_strategy: reassessStrategy.trim() || selectedRisk.mitigationStrategy,
            escalation_target: reassessEscalation.trim() || null,
            next_review_date: reassessNextReview || null,
          };

      const updated = await apiClient.put<RiskOut>(`/risks/${selectedRisk.id}`, payload);
      setReassessOpen(false);
      onNotify(`Updated risk ${updated.code} (${updated.inherent_score} ${updated.severity}, residual ${updated.residual_score}).`);
      await fetchRisks();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to update risk assessment.');
    } finally {
      setSaving(false);
    }
  };

  const handleEscalateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRisk || !canUpdateTreatmentStatus) return;

    const target = escalateTarget.trim() || 'Board Audit Committee';
    if (mode === 'demo') {
      setDemoRisks((prev) =>
        prev.map((r) =>
          r.id === selectedRisk.id
            ? {
                ...r,
                escalation: target,
                status: r.status === 'Open' ? 'In Review' : r.status,
                auditLog: [
                  {
                    timestamp: 'Just Now',
                    title: `Escalated to ${target}`,
                    detail: escalateNote.trim() || 'Formal governance escalation triggered.',
                    tone: 'error',
                  },
                  ...r.auditLog,
                ],
              }
            : r
        )
      );
      setEscalateOpen(false);
      setEscalateNote('');
      onNotify(`Escalated ${selectedRisk.code} to ${target} (Demo).`);
      return;
    }

    setSaving(true);
    try {
      const updated = await apiClient.post<RiskOut>(`/risks/${selectedRisk.id}/escalate`, {
        escalation_target: target,
        note: escalateNote.trim() || null,
      });
      setEscalateOpen(false);
      setEscalateNote('');
      onNotify(`Escalated ${updated.code} to ${updated.escalation_target || target} & notified executives.`);
      await fetchRisks();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Risk escalation failed.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMilestone = async (ms: UnifiedRisk['milestones'][number]) => {
    if (!selectedRisk) return;

    if (mode === 'demo') {
      setDemoRisks((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRisk.id) return r;
          const updatedMilestones = r.milestones.map((m) =>
            m.id === ms.id ? { ...m, completed: !m.completed, inProgress: false } : m
          );
          const completedCount = updatedMilestones.filter((m) => m.completed).length;
          const nextProgress =
            updatedMilestones.length > 0 ? Math.round((completedCount / updatedMilestones.length) * 100) : r.progress;
          return { ...r, milestones: updatedMilestones, progress: nextProgress };
        })
      );
      onNotify(`Updated remediation milestone for ${selectedRisk.code}.`);
      return;
    }

    if (!hasRole('Admin', 'Auditor', 'Department Head')) {
      onNotify('Only Admin, Auditor, or Department Head can update remediation milestones.');
      return;
    }
    const nextStatus: ActionStatusLiteral = ms.rawStatus === 'Submitted' ? 'In Progress' : 'Submitted';
    setSaving(true);
    try {
      await apiClient.put(`/actions/${ms.id}`, {
        status: nextStatus,
        progress_percent: nextStatus === 'Submitted' ? 100 : 50,
      });
      onNotify(`Updated milestone ${ms.code} -> ${nextStatus}.`);
      await fetchRisks();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Milestone update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOffTreatment = async () => {
    if (!selectedRisk || !canUpdateTreatmentStatus) {
      onNotify('Admin, Auditor, or Management role required to sign off risk treatment.');
      return;
    }

    if (mode === 'demo') {
      setDemoRisks((prev) =>
        prev.map((r) => (r.id === selectedRisk.id ? { ...r, status: 'Mitigated', progress: 100 } : r))
      );
      onNotify(`Treatment plan signed off for ${selectedRisk.code} (${selectedRisk.title}).`);
      return;
    }

    setSaving(true);
    try {
      const updated = await apiClient.put<RiskOut>(`/risks/${selectedRisk.id}`, {
        status: 'Mitigated',
      });
      onNotify(`Treatment plan signed off: ${updated.code} marked ${updated.status}.`);
      await fetchRisks();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to sign off treatment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCsv = () => {
    auditService.exportCsvRows(
      'CompanyAudit_Risk_Register_Matrix.csv',
      ['Risk Code', 'Title', 'Category', 'Probability', 'Impact', 'Inherent Score', 'Severity', 'Lead Owner', 'Status'],
      filteredRisks.map((r) => [
        r.code,
        r.title,
        r.category,
        r.probability,
        r.impact,
        r.score,
        r.severity,
        r.owner.name,
        r.status,
      ])
    );
    onNotify(`Exported ${filteredRisks.length} enterprise risk records to CSV.`);
  };

  const handleDownloadRiskBrief = (risk: UnifiedRisk) => {
    auditService.exportCsvRows(
      `${risk.code}_Risk_Assessment_Brief.csv`,
      ['Risk Code', 'Title', 'Scope', 'Category', 'Likelihood', 'Impact', 'Inherent Score', 'Severity', 'Residual Score', 'Owner', 'Status', 'Mitigation Strategy'],
      [
        [
          risk.code,
          risk.title,
          risk.scope,
          risk.category,
          risk.probability,
          risk.impact,
          risk.score,
          risk.severity,
          risk.residualScore,
          risk.owner.name,
          risk.status,
          risk.mitigationStrategy,
        ],
      ]
    );
    onNotify(`Downloaded structured assessment brief CSV for ${risk.code}.`);
  };

  const livePreviewScore = createProb * createImpact;
  const livePreviewSeverity = classifyRiskBand(livePreviewScore);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Interactive Matrix Filter Banner */}
      {bannerText && (
        <div className="bg-secondary-container text-on-secondary px-5 py-3 rounded-xl flex items-center justify-between gap-4 shadow-exec-sm">
          <div className="flex items-center gap-2.5">
            <Filter className="w-4 h-4 shrink-0" />
            <span className="text-label-lg">{bannerText}</span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-label-sm uppercase tracking-wider underline hover:opacity-80 shrink-0"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Standardized Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Governance & Risk', to: '/dashboard' },
          { label: 'Risk Register & Compliance Matrix' },
        ]}
        title="Risk & Compliance Matrix"
        description="Dynamic enterprise risk evaluation, 5×5 probability-impact heat matrix (1–4 Low, 5–9 Med, 10–16 High, 17–25 Critical), and statutory framework benchmarks."
        actions={
          <>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="h-10 px-4 bg-surface-container-lowest text-on-surface text-label-lg rounded-lg border border-border-hairline shadow-exec-sm hover:bg-surface-container-low transition-colors inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-secondary" />
              <span>Export Matrix</span>
            </button>
            <button
              type="button"
              disabled={!canCreateOrReassess}
              onClick={() => setCreateOpen(true)}
              title={canCreateOrReassess ? 'Register a new enterprise risk' : 'Admin or Auditor role required'}
              className="h-10 px-4 bg-secondary text-on-secondary text-label-lg rounded-lg shadow-exec-sm hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <ShieldPlus className="w-4 h-4" />
              <span>Register New Risk</span>
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

      {/* Executive KPI Metric Row — Strictly Aligned 17-25 / 10-16 / 5-9 / 1-4 Bands */}
      <section aria-label="Risk Severity Distribution" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div
          onClick={() => handleFilterBySeverity('Critical')}
          className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between group hover:shadow-exec-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Critical Risks</span>
            <StatusBadge tone="danger">Score 17–25</StatusBadge>
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <div className="text-display-lg font-extrabold text-error tabular-nums">{severityCounts.Critical}</div>
            <div className="flex items-center gap-1.5 text-label-md text-error font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>Immediate</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low/60 rounded-lg px-3 py-2">
            <span className="text-body-sm text-on-surface-variant">Immediate mitigation required</span>
            <ArrowRight className="w-4 h-4 text-error group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => handleFilterBySeverity('High')}
          className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between group hover:shadow-exec-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">High Risks</span>
            <StatusBadge tone="secondary">Score 10–16</StatusBadge>
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <div className="text-display-lg font-extrabold text-primary tabular-nums">{severityCounts.High}</div>
            <div className="flex items-center gap-1.5 text-label-md text-secondary font-semibold">
              <TrendingUp className="w-4 h-4" />
              <span>Active Track</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low/60 rounded-lg px-3 py-2">
            <span className="text-body-sm text-on-surface-variant">Assigned to department heads</span>
            <ArrowRight className="w-4 h-4 text-secondary group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => handleFilterBySeverity('Medium')}
          className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between group hover:shadow-exec-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Medium Risks</span>
            <StatusBadge tone="neutral">Score 5–9</StatusBadge>
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <div className="text-display-lg font-extrabold text-primary tabular-nums">{severityCounts.Medium}</div>
            <div className="flex items-center gap-1.5 text-label-md text-on-surface-variant font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Monitored</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low/60 rounded-lg px-3 py-2">
            <span className="text-body-sm text-on-surface-variant">Under standard control watch</span>
            <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <div
          onClick={() => handleFilterBySeverity('Low')}
          className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between group hover:shadow-exec-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-md text-on-surface-variant uppercase tracking-wider">Low Risks</span>
            <StatusBadge tone="neutral">Score 1–4</StatusBadge>
          </div>
          <div className="my-4 flex items-baseline justify-between">
            <div className="text-display-lg font-extrabold text-primary tabular-nums">{severityCounts.Low}</div>
            <div className="flex items-center gap-1.5 text-label-md text-on-surface-variant font-semibold">
              <BadgeCheck className="w-4 h-4" />
              <span>Within Tolerance</span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-surface-container-low/60 rounded-lg px-3 py-2">
            <span className="text-body-sm text-on-surface-variant">Within enterprise risk appetite</span>
            <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </section>

      {/* Interactive 5x5 Enterprise Risk Matrix & Compliance Benchmarks */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 5x5 Risk Matrix (7 Cols) */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-secondary" />
                  <h2 className="text-headline-lg text-primary">5×5 Enterprise Inherent Risk Matrix</h2>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Select any cell to filter the register below, or click a risk badge to inspect details.
                </p>
              </div>
              <StatusBadge dot tone="secondary">
                {unifiedRisks.length} Tracked Vectors
              </StatusBadge>
            </div>

            <div className="flex gap-3 pt-2">
              <div className="flex flex-col items-center justify-between pb-7">
                <span className="text-label-sm uppercase tracking-wider text-outline [writing-mode:vertical-rl] rotate-180 mb-2">
                  Likelihood
                </span>
                <div className="flex flex-col justify-between h-full py-1 text-right font-mono text-label-sm text-on-surface-variant pr-1">
                  {PROBABILITY_ROWS.map((row) => (
                    <span key={row.p}>{row.label}</span>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="grid grid-cols-5 gap-2 flex-1 min-h-[300px]">
                  {PROBABILITY_ROWS.map((row) =>
                    IMPACT_COLS.map((col) => {
                      const score = row.p * col.i;
                      const tone = getCellTone(row.p, col.i);
                      const cellRisks = unifiedRisks.filter(
                        (r) => r.probability === row.p && r.impact === col.i
                      );
                      const isSelectedCell = exactCell?.p === row.p && exactCell?.i === col.i;
                      const isCenter = row.p === 3 && col.i === 3;
                      return (
                        <div
                          key={`${row.p}-${col.i}`}
                          onClick={() => handleSelectMatrixCell(row.p, col.i, tone.level)}
                          className={`group relative rounded-lg ${tone.bgClass} ${
                            isSelectedCell
                              ? 'ring-2 ring-secondary'
                              : isCenter
                                ? 'ring-1 ring-secondary/40'
                                : ''
                          } hover:scale-[1.02] p-2.5 flex flex-col justify-between cursor-pointer transition-all`}
                        >
                          <span className={`font-mono text-label-sm ${tone.numClass}`}>{score}</span>
                          {cellRisks.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {cellRisks.map((cr) => (
                                <button
                                  key={cr.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRiskModal(cr);
                                  }}
                                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shadow-exec-sm ${
                                    cr.severity === 'Critical'
                                      ? 'bg-error text-on-error'
                                      : cr.severity === 'High'
                                        ? 'bg-secondary text-on-secondary'
                                        : 'bg-primary text-on-primary'
                                  }`}
                                >
                                  {cr.code}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="grid grid-cols-5 gap-2 pt-2 text-center font-mono text-label-sm text-on-surface-variant">
                  {IMPACT_COLS.map((col) => (
                    <span key={col.i}>{col.label}</span>
                  ))}
                </div>
                <div className="text-center pt-1.5">
                  <span className="text-label-sm uppercase tracking-wider text-outline">Impact (Severity)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 bg-surface-container-low/70 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-on-surface-variant text-label-sm">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-surface-container-low border border-border-hairline" /> Low (1–4)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-surface-container-high" /> Med (5–9)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-surface-container-highest" /> High (10–16)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-error-container" /> Critical (17–25)
              </span>
            </div>
            <span className="text-secondary font-semibold">Click cell to filter</span>
          </div>
        </div>

        {/* Right Column: Compliance Posture Cards (5 Cols) */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-secondary" />
                  <h2 className="text-headline-lg text-primary">Compliance Posture</h2>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Statutory framework assurance targets &amp; audit scope readiness
                </p>
              </div>
              <Link
                to="/audits/checklists"
                className="text-label-md text-secondary hover:underline font-semibold inline-flex items-center gap-1 shrink-0"
              >
                <span>Audit Hub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            {mode === 'api' ? (
              loading && frameworkCompliance.length === 0 ? (
                <div className="p-6 text-center text-body-sm text-outline">
                  Calculating live statutory framework posture from PostgreSQL control tests...
                </div>
              ) : frameworkCompliance.length === 0 ? (
                <div className="p-5 rounded-xl bg-surface-container-low/70 border border-border-hairline text-body-sm text-on-surface-variant">
                  No statutory control evaluations recorded in PostgreSQL yet. Evaluate checklist controls to compute live framework scores.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {frameworkCompliance.map((fw) => {
                    const roundedScore = Math.round(fw.score);
                    const tone =
                      fw.status === 'Compliant'
                        ? 'secondary'
                        : fw.status === 'Monitor'
                          ? 'info'
                          : fw.status === 'Needs Attention'
                            ? 'danger'
                            : 'neutral';
                    const fillClass =
                      fw.status === 'Needs Attention'
                        ? 'bg-error'
                        : fw.status === 'Compliant'
                          ? 'bg-secondary'
                          : fw.status === 'Monitor'
                            ? 'bg-primary'
                            : 'bg-outline';

                    return (
                      <div
                        key={fw.framework}
                        className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60"
                      >
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-headline-sm text-on-surface font-bold">{fw.framework}</span>
                            <StatusBadge tone={tone}>
                              {fw.controls_evaluated > 0 ? `${roundedScore}% • ${fw.status}` : 'Not Evaluated'}
                            </StatusBadge>
                          </div>
                          <span className="font-mono text-label-sm text-on-surface-variant">
                            {fw.controls_evaluated}/{fw.controls_total} controls
                          </span>
                        </div>
                        <ProgressBar
                          value={roundedScore}
                          heightClass="h-2"
                          trackClass="bg-surface-container-high"
                          fillClass={fillClass}
                        />
                        <div className="flex justify-between text-label-sm text-on-surface-variant mt-2">
                          <span>Weighted Checklist Control Score</span>
                          <span
                            className={`font-semibold ${
                              fw.status === 'Needs Attention'
                                ? 'text-error'
                                : fw.status === 'Compliant'
                                  ? 'text-secondary'
                                  : 'text-on-surface'
                            }`}
                          >
                            {fw.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-3.5">
                <div className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-headline-sm text-on-surface font-bold">SOC 2 Type II</span>
                      <StatusBadge tone="secondary">94% Target</StatusBadge>
                    </div>
                    <span className="font-mono text-label-sm text-on-surface-variant">Surveillance</span>
                  </div>
                  <ProgressBar value={94} heightClass="h-2" trackClass="bg-surface-container-high" />
                  <div className="flex justify-between text-label-sm text-on-surface-variant mt-2">
                    <span>Trust Services Criteria CC1–CC9</span>
                    <span className="text-secondary font-semibold">Assurance Valid</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-headline-sm text-on-surface font-bold">ISO/IEC 27001</span>
                      <StatusBadge tone="neutral">88% Stage 2</StatusBadge>
                    </div>
                    <span className="font-mono text-label-sm text-on-surface-variant">Annex A</span>
                  </div>
                  <ProgressBar
                    value={88}
                    heightClass="h-2"
                    trackClass="bg-surface-container-high"
                    fillClass="bg-primary"
                  />
                  <div className="flex justify-between text-label-sm text-on-surface-variant mt-2">
                    <span>ISMS Information Security Controls</span>
                    <span className="text-on-surface font-semibold">Fieldwork</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-headline-sm text-on-surface font-bold">GDPR &amp; Privacy</span>
                      <StatusBadge tone="secondary">92% Compliant</StatusBadge>
                    </div>
                    <span className="font-mono text-label-sm text-on-surface-variant">Art. 30 / SCC</span>
                  </div>
                  <ProgressBar value={92} heightClass="h-2" trackClass="bg-surface-container-high" />
                  <div className="flex justify-between text-label-sm text-on-surface-variant mt-2">
                    <span>DPIA &amp; Cross-Border Controls</span>
                    <span className="text-secondary font-semibold">Active Monitor</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-headline-sm text-on-surface font-bold">NIST CSF 2.0</span>
                      <StatusBadge tone="neutral">81% Tier 3</StatusBadge>
                    </div>
                    <span className="font-mono text-label-sm text-on-surface-variant">Govern / Protect</span>
                  </div>
                  <ProgressBar
                    value={81}
                    heightClass="h-2"
                    trackClass="bg-surface-container-high"
                    fillClass="bg-outline"
                  />
                  <div className="flex justify-between text-label-sm text-on-surface-variant mt-2">
                    <span>Identity &amp; Incident Governance</span>
                    <span className="text-on-surface font-semibold">Remediating</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-surface-container">
            <Link
              to="/audits/evidence"
              className="w-full h-10 bg-surface-container-low hover:bg-surface-container text-on-surface text-label-lg rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <span>View Framework Cross-walk &amp; Evidence</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Dedicated Filter Toolbar */}
      <FilterToolbar
        searchValue={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setPage(1);
        }}
        searchPlaceholder="Search risks by code, title, owner, or mitigation..."
        activeFilterCount={activeFilterCount}
        onReset={handleResetFilters}
        rightActions={
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="h-10 px-4 bg-surface-container-low hover:bg-surface-container text-on-surface text-label-md rounded-lg inline-flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-secondary" />
            <span>Download CSV</span>
          </button>
        }
      >
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="h-10 px-3.5 bg-surface-container-low/70 rounded-lg border border-border-hairline text-body-sm text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">All Categories</option>
          <option value="Technology">Technology</option>
          <option value="Financial">Financial</option>
          <option value="Compliance">Compliance</option>
          <option value="Operations">Operations</option>
          <option value="Strategic">Strategic</option>
          <option value="HR">HR</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value as RiskSeverity | 'All');
            setExactCell(null);
            setPage(1);
          }}
          aria-label="Filter by severity"
          className="h-10 px-3.5 bg-surface-container-low/70 rounded-lg border border-border-hairline text-body-sm text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">All Severities</option>
          <option value="Critical">Critical (17–25)</option>
          <option value="High">High (10–16)</option>
          <option value="Medium">Medium (5–9)</option>
          <option value="Low">Low (1–4)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as RiskStatusLiteral | 'All');
            setPage(1);
          }}
          aria-label="Filter by review status"
          className="h-10 px-3.5 bg-surface-container-low/70 rounded-lg border border-border-hairline text-body-sm text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Under Treatment">Under Treatment</option>
          <option value="In Review">In Review</option>
          <option value="Mitigated">Mitigated</option>
          <option value="Accepted">Accepted</option>
        </select>
      </FilterToolbar>

      {/* Streamlined Risk Register Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden">
        {mode === 'api' && loading && unifiedRisks.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading enterprise risks from PostgreSQL...</div>
        ) : filteredRisks.length === 0 ? (
          <EmptyState
            title="No matching enterprise risks"
            description="No risk vectors match your current matrix selection or filter parameters."
            actionLabel="Reset Risk Filters"
            onAction={handleResetFilters}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Risk Code</th>
                  <th className="py-3.5 px-5 font-semibold">Threat / Risk Title &amp; Scope</th>
                  <th className="py-3.5 px-5 font-semibold">Category</th>
                  <th className="py-3.5 px-5 font-semibold">Heat Score (P×I)</th>
                  <th className="py-3.5 px-5 font-semibold">Lead Owner</th>
                  <th className="py-3.5 px-5 font-semibold">Mitigation Strategy</th>
                  <th className="py-3.5 px-5 font-semibold">Status</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-body-sm">
                {pagedRisks.map((risk) => (
                  <tr
                    key={risk.id}
                    onClick={() => openRiskModal(risk)}
                    className="hover:bg-surface-container-low/60 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-6 font-mono text-data-mono font-bold text-secondary whitespace-nowrap">
                      {risk.code}
                    </td>
                    <td className="py-4 px-5 max-w-xs">
                      <div className="flex flex-col">
                        <span
                          title={risk.title}
                          className="text-headline-sm text-on-surface font-semibold group-hover:text-secondary transition-colors line-clamp-1"
                        >
                          {risk.title}
                        </span>
                        <span className="text-on-surface-variant text-body-sm line-clamp-1 mt-0.5">{risk.scope}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <StatusBadge tone="neutral">{risk.category}</StatusBadge>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <StatusBadge
                        dot
                        tone={
                          risk.severity === 'Critical'
                            ? 'danger'
                            : risk.severity === 'High'
                              ? 'secondary'
                              : 'neutral'
                        }
                      >
                        <span className="font-mono tabular-nums">
                          {risk.score} {risk.severity} ({risk.probability}×{risk.impact})
                        </span>
                      </StatusBadge>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full ${risk.owner.avatarBg} flex items-center justify-center text-label-sm font-bold shrink-0`}
                        >
                          {risk.owner.initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-body-sm font-medium text-on-surface leading-tight">
                            {risk.owner.name}
                          </span>
                          <span className="text-label-sm text-outline leading-tight">{risk.owner.role}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-on-surface-variant max-w-xs">
                      <span title={risk.mitigationStrategy} className="line-clamp-2">
                        {risk.mitigationStrategy}
                      </span>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <StatusBadge
                        tone={
                          risk.status === 'Open'
                            ? 'danger'
                            : risk.status === 'Mitigated' || risk.status === 'Accepted'
                              ? 'success'
                              : 'secondary'
                        }
                      >
                        {risk.status}
                      </StatusBadge>
                    </td>
                    <td
                      className="py-4 px-6 text-right"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRiskModal(risk);
                      }}
                    >
                      <button
                        type="button"
                        className="p-1.5 text-outline hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors"
                        aria-label={`Inspect ${risk.code}`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 bg-surface-container-low/40 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant text-body-sm">
          <div className="flex items-center gap-1.5">
            <span>Showing</span>
            <span className="font-mono font-bold text-on-surface">{pagedRisks.length}</span>
            <span>of</span>
            <span className="font-mono font-bold text-on-surface">{filteredRisks.length}</span>
            <span>matching risks ({unifiedRisks.length} registered)</span>
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
                className={`w-8 h-8 rounded-lg font-mono text-label-md font-bold flex items-center justify-center transition-colors ${
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

      {/* Register New Risk Creation Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-create-risk"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setCreateOpen(false)} />
          <form
            onSubmit={handleCreateRiskSubmit}
            className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10 my-auto"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldPlus className="w-5 h-5 text-secondary" />
                <h3 id="modal-create-risk" className="text-headline-lg text-primary font-bold">
                  Register Enterprise Risk Vector
                </h3>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="w-5 h-5 text-outline" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Risk Title</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g. Third-Party KMS Single-Region Key Custody Dependency"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Scope Description
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={createScope}
                  onChange={(e) => setCreateScope(e.target.value)}
                  placeholder="e.g. Production Cloud Secrets Infrastructure / US-East & EU-West"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Category</label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value as RiskCategoryLiteral)}
                    className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  >
                    <option value="Technology">Technology</option>
                    <option value="Financial">Financial</option>
                    <option value="Compliance">Compliance</option>
                    <option value="Operations">Operations</option>
                    <option value="Strategic">Strategic</option>
                    <option value="HR">HR</option>
                  </select>
                </div>

                {mode === 'api' && (
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Department
                    </label>
                    <select
                      required
                      value={createDeptId}
                      onChange={(e) => setCreateDeptId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mode === 'api' && (
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Linked Audit (Optional)
                    </label>
                    <select
                      value={createAuditId}
                      onChange={(e) => setCreateAuditId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      <option value="">None</option>
                      {audits.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low/80 border border-border-hairline space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-label-md uppercase font-bold text-primary">
                    Inherent Risk Scoring (P × I)
                  </span>
                  <StatusBadge
                    tone={
                      livePreviewSeverity === 'Critical'
                        ? 'danger'
                        : livePreviewSeverity === 'High'
                          ? 'secondary'
                          : 'neutral'
                    }
                  >
                    Score {livePreviewScore} / 25 • {livePreviewSeverity}
                  </StatusBadge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-label-sm text-outline mb-1">Inherent Prob (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={createProb}
                      onChange={(e) => setCreateProb(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm text-outline mb-1">Inherent Impact (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={createImpact}
                      onChange={(e) => setCreateImpact(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm text-outline mb-1">Residual Prob (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={createResProb}
                      onChange={(e) => setCreateResProb(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm text-outline mb-1">Residual Impact (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={createResImpact}
                      onChange={(e) => setCreateResImpact(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Mitigation Strategy
                </label>
                <textarea
                  rows={2}
                  value={createStrategy}
                  onChange={(e) => setCreateStrategy(e.target.value)}
                  placeholder="Describe compensating controls, automation, and target SLA..."
                  className="w-full p-3 rounded-lg border border-border-hairline text-body-sm focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Escalation Target
                </label>
                <input
                  type="text"
                  value={createEscalation}
                  onChange={(e) => setCreateEscalation(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary disabled:opacity-50 text-label-lg"
              >
                {saving ? 'Registering...' : 'Register Risk Vector'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive 4-Tab Risk Detail Modal */}
      {selectedRisk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-risk-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div
            className="fixed inset-0 bg-primary/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setSelectedRiskId(null)}
          />
          <div className="relative w-full max-w-3xl bg-surface-container-lowest rounded-xl shadow-exec-lg border border-border-hairline overflow-hidden z-10 my-auto flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-surface-container-lowest border-b border-border-hairline flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-label-md font-bold px-2.5 py-0.5 rounded bg-primary-container text-on-primary">
                    {selectedRisk.code}
                  </span>
                  <StatusBadge tone="neutral">{selectedRisk.category}</StatusBadge>
                  <StatusBadge dot tone={selectedRisk.severity === 'Critical' ? 'danger' : 'secondary'}>
                    {selectedRisk.score} {selectedRisk.severity} — Likelihood {selectedRisk.probability} × Impact{' '}
                    {selectedRisk.impact}
                  </StatusBadge>
                  <StatusBadge tone={selectedRisk.status === 'Mitigated' ? 'success' : 'secondary'}>
                    {selectedRisk.status}
                  </StatusBadge>
                </div>
                <h2 id="modal-risk-title" className="text-headline-lg text-primary font-bold tracking-tight">
                  {selectedRisk.title}
                </h2>
                <p className="text-body-sm text-on-surface-variant">{selectedRisk.scope}</p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setSelectedRiskId(null)}
                className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Navigation */}
            <div className="px-6 bg-surface-container-low/40 border-b border-border-hairline flex items-center gap-6 shrink-0 overflow-x-auto">
              {(
                [
                  { id: 'overview', label: 'Overview & Assessment' },
                  { id: 'mitigation', label: 'Mitigation Plan & Controls' },
                  { id: 'compliance', label: 'Statutory Frameworks' },
                  { id: 'audit', label: 'Audit Trail & Sign-Off' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id)}
                  className={`py-3 text-label-lg border-b-2 transition-colors whitespace-nowrap ${
                    modalTab === tab.id
                      ? 'text-secondary border-secondary font-bold'
                      : 'text-on-surface-variant hover:text-on-surface border-transparent font-medium'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
              {modalTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-error-container/35 border border-error-container flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                          Inherent Risk Score
                        </span>
                        <span className="px-2 py-0.5 bg-error text-on-error font-mono text-label-sm font-bold rounded">
                          Unmitigated
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 my-1">
                        <span className="text-display-md font-extrabold text-error tabular-nums">
                          {selectedRisk.score}
                        </span>
                        <span className="text-body-sm text-error font-semibold">{selectedRisk.severity} Threat</span>
                      </div>
                      <p className="text-body-sm text-on-surface-variant">
                        Likelihood: {selectedRisk.probability} × Impact: {selectedRisk.impact} Enterprise Exposure
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-secondary-container/10 border border-secondary-container/30 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                          Projected Residual Risk
                        </span>
                        <span className="px-2 py-0.5 bg-secondary-container text-on-secondary font-mono text-label-sm font-bold rounded">
                          Post-Remediation
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 my-1">
                        <span className="text-display-md font-extrabold text-secondary tabular-nums">
                          {selectedRisk.residualScore}
                        </span>
                        <span className="text-body-sm text-secondary font-semibold">{selectedRisk.residualLevel}</span>
                      </div>
                      <p className="text-body-sm text-on-surface-variant">
                        Target tolerance corridor after control verification
                      </p>
                    </div>
                  </div>

                  {reassessOpen && (
                    <form
                      onSubmit={handleSaveReassessment}
                      className="p-4 rounded-xl bg-surface-container-low border border-secondary/40 space-y-3"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-label-lg font-bold text-primary flex items-center gap-1.5">
                          <SlidersHorizontal className="w-4 h-4 text-secondary" />
                          <span>
                            {canCreateOrReassess
                              ? 'Live Score Re-Assessment & Residual Calibration'
                              : 'Update Escalation Target & Review Schedule'}
                          </span>
                        </span>
                        {canCreateOrReassess && (
                          <StatusBadge tone="secondary">
                            Inherent {reassessProb * reassessImpact} ({classifyRiskBand(reassessProb * reassessImpact)}) • Residual {reassessResProb * reassessResImpact}
                          </StatusBadge>
                        )}
                      </div>

                      {canCreateOrReassess && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-label-sm text-outline mb-1">Inherent Prob (1–5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={reassessProb}
                                onChange={(e) => setReassessProb(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                                className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-label-sm text-outline mb-1">Inherent Impact (1–5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={reassessImpact}
                                onChange={(e) => setReassessImpact(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                                className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-label-sm text-outline mb-1">Residual Prob (1–5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={reassessResProb}
                                onChange={(e) => setReassessResProb(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                                className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-label-sm text-outline mb-1">Residual Impact (1–5)</label>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                value={reassessResImpact}
                                onChange={(e) => setReassessResImpact(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                                className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-label-sm text-outline mb-1">Updated Mitigation Strategy</label>
                            <input
                              type="text"
                              value={reassessStrategy}
                              onChange={(e) => setReassessStrategy(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                            />
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-label-sm text-outline mb-1">Escalation Target</label>
                          <input
                            type="text"
                            value={reassessEscalation}
                            onChange={(e) => setReassessEscalation(e.target.value)}
                            placeholder="e.g. Board Audit Committee"
                            className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-label-sm text-outline mb-1">Next Governance Review Date</label>
                          <input
                            type="date"
                            value={reassessNextReview}
                            onChange={(e) => setReassessNextReview(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest font-mono text-body-sm"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setReassessOpen(false)}
                          className="h-8 px-3 rounded-lg border border-border-hairline text-label-sm bg-surface-container-lowest"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="h-8 px-4 rounded-lg bg-secondary text-on-secondary text-label-sm"
                        >
                          {saving ? 'Updating...' : canCreateOrReassess ? 'Apply Re-assessment' : 'Save Governance Schedule'}
                        </button>
                      </div>
                    </form>
                  )}

                  {escalateOpen && (
                    <form
                      onSubmit={handleEscalateRisk}
                      className="p-4 rounded-xl bg-error-container/25 border border-error/30 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-label-lg font-bold text-error flex items-center gap-1.5">
                          <Send className="w-4 h-4" />
                          <span>Escalate Risk &amp; Trigger Executive Alert</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-label-sm text-outline mb-1">Escalation Target</label>
                          <input
                            type="text"
                            required
                            value={escalateTarget}
                            onChange={(e) => setEscalateTarget(e.target.value)}
                            placeholder="Board Audit Committee / CISO"
                            className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-label-sm text-outline mb-1">Escalation Rationale (Optional)</label>
                          <input
                            type="text"
                            value={escalateNote}
                            onChange={(e) => setEscalateNote(e.target.value)}
                            placeholder="Reason for committee visibility..."
                            className="w-full h-9 px-3 rounded-lg border border-border-hairline bg-surface-container-lowest text-body-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEscalateOpen(false)}
                          className="h-8 px-3 rounded-lg border border-border-hairline text-label-sm bg-surface-container-lowest"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="h-8 px-4 rounded-lg bg-error text-on-error text-label-sm font-semibold"
                        >
                          {saving ? 'Escalating...' : 'Confirm Escalation'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2 bg-surface-container-low/60 rounded-xl p-4 border border-border-hairline">
                    <h3 className="text-label-lg font-bold text-on-surface flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-secondary" />
                      <span>Threat Narrative &amp; Root Cause Analysis</span>
                    </h3>
                    <p className="text-body-md text-on-surface-variant leading-relaxed">{selectedRisk.narrative}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-surface-container-low/60 rounded-xl p-4 border border-border-hairline">
                      <span className="text-label-sm uppercase tracking-wider text-outline font-bold block mb-2">
                        Affected Scope &amp; Assets
                      </span>
                      <ul className="space-y-2 text-body-sm text-on-surface">
                        {selectedRisk.affectedAssets.map((asset) => (
                          <li key={asset} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-2 shrink-0" />
                            <span>{asset}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-surface-container-low/60 rounded-xl p-4 border border-border-hairline flex flex-col justify-between">
                      <div>
                        <span className="text-label-sm uppercase tracking-wider text-outline font-bold block mb-2.5">
                          Lead Risk Owner &amp; Accountability
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-label-lg font-bold">
                            {selectedRisk.owner.initials}
                          </div>
                          <div>
                            <div className="text-headline-sm text-on-surface font-bold">{selectedRisk.owner.name}</div>
                            <div className="text-body-sm text-on-surface-variant">{selectedRisk.owner.role}</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border-hairline/70 flex items-center justify-between text-on-surface-variant text-label-sm">
                        <span>
                          Escalation: <strong className="text-on-surface">{selectedRisk.escalation}</strong>
                        </span>
                        <span>
                          Next Review: <strong className="text-secondary">{selectedRisk.nextReview}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'mitigation' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-label-lg font-bold text-on-surface">
                        Active Remediation Control Progress
                      </span>
                      <span className="font-mono font-bold text-secondary text-headline-sm tabular-nums">
                        {selectedRisk.progress}% Complete
                      </span>
                    </div>
                    <ProgressBar
                      value={selectedRisk.progress}
                      heightClass="h-2.5"
                      trackClass="bg-surface-container-high"
                      fillClass="bg-secondary-container"
                    />
                    <p className="text-body-sm text-on-surface-variant pt-1">{selectedRisk.mitigationStrategy}</p>
                  </div>

                  <div className="bg-surface-container-lowest rounded-xl border border-border-hairline p-4 space-y-3">
                    <span className="text-label-sm uppercase tracking-wider text-outline font-bold block">
                      Remediation Milestones &amp; Verification Checks
                    </span>
                    {selectedRisk.milestones.length === 0 ? (
                      <p className="text-body-sm text-on-surface-variant">
                        No separate corrective action milestones linked to {selectedRisk.code}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedRisk.milestones.map((ms) => (
                          <label
                            key={ms.id}
                            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={ms.completed}
                              disabled={saving}
                              onChange={() => toggleMilestone(ms)}
                              className="mt-1 rounded text-secondary focus:ring-secondary"
                            />
                            <div>
                              <span className="text-label-lg text-on-surface font-semibold block">{ms.title}</span>
                              <span
                                className={`text-body-sm ${
                                  ms.inProgress ? 'text-secondary font-medium' : 'text-on-surface-variant'
                                }`}
                              >
                                {ms.subtitle}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalTab === 'compliance' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline">
                    <h4 className="text-headline-sm text-on-surface font-bold mb-1">
                      Directly Mapped Regulatory Controls
                    </h4>
                    <p className="text-body-sm text-on-surface-variant">
                      Statutory governance obligations correlated to {selectedRisk.code}:
                    </p>
                  </div>
                  {selectedRisk.frameworks.length === 0 ? (
                    <p className="text-body-sm text-on-surface-variant">
                      General enterprise governance &amp; internal control mapping.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {selectedRisk.frameworks.map((fw) => (
                        <div
                          key={fw.code}
                          className="p-4 bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-sm space-y-1.5"
                        >
                          <StatusBadge tone="secondary">
                            <span className="font-mono">{fw.code}</span>
                          </StatusBadge>
                          <div className="text-label-lg font-bold text-on-surface">{fw.name}</div>
                          <p className="text-body-sm text-on-surface-variant">{fw.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'audit' && (
                <div className="space-y-3">
                  {selectedRisk.auditLog.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-4 rounded-xl bg-surface-container-low/60 border border-border-hairline/70"
                    >
                      {entry.tone === 'error' ? (
                        <ShieldAlert className="w-5 h-5 text-error mt-0.5 shrink-0" />
                      ) : entry.tone === 'secondary' ? (
                        <BadgeCheck className="w-5 h-5 text-secondary mt-0.5 shrink-0" />
                      ) : (
                        <History className="w-5 h-5 text-outline mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label-lg text-on-surface font-bold">{entry.title}</span>
                          <span className="font-mono text-label-sm text-outline">{entry.timestamp}</span>
                        </div>
                        <p className="text-body-sm text-on-surface-variant">{entry.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadRiskBrief(selectedRisk)}
                className="h-9 px-4 bg-surface-container-lowest border border-border-hairline text-on-surface text-label-md rounded-lg hover:bg-surface-container transition-colors inline-flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Download className="w-4 h-4 text-secondary" />
                <span>Download Risk Brief (CSV)</span>
              </button>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedRiskId(null)}
                  className="h-9 px-4 bg-surface-container-lowest border border-border-hairline text-on-surface-variant hover:text-on-surface text-label-md rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!canUpdateTreatmentStatus}
                  onClick={() => {
                    setModalTab('overview');
                    setEscalateOpen(false);
                    setReassessOpen((prev) => !prev);
                  }}
                  title={
                    canCreateOrReassess
                      ? 'Re-assess Inherent & Residual Risk Scores'
                      : canUpdateTreatmentStatus
                        ? 'Update Review Date & Escalation Target'
                        : 'Admin, Auditor, or Management role required'
                  }
                  className="h-9 px-4 bg-surface-container-highest text-secondary text-label-md rounded-lg hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
                >
                  {canCreateOrReassess ? 'Re-assess Score' : 'Update Review'}
                </button>
                <button
                  type="button"
                  disabled={!canUpdateTreatmentStatus || saving}
                  onClick={() => {
                    setModalTab('overview');
                    setReassessOpen(false);
                    setEscalateOpen((prev) => !prev);
                  }}
                  title={
                    canUpdateTreatmentStatus
                      ? 'Escalate risk to Audit Committee or Executive sponsor'
                      : 'Admin, Auditor, or Management role required'
                  }
                  className="h-9 px-3.5 bg-error-container/60 text-error border border-error/25 text-label-md rounded-lg hover:bg-error-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Escalate</span>
                </button>
                <button
                  type="button"
                  disabled={!canUpdateTreatmentStatus || saving || selectedRisk.status === 'Mitigated'}
                  onClick={handleSignOffTreatment}
                  title={
                    canUpdateTreatmentStatus
                      ? 'Sign off risk treatment plan'
                      : 'Admin, Auditor, or Management role required'
                  }
                  className="h-9 px-4 bg-secondary text-on-secondary text-label-md rounded-lg hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold inline-flex items-center gap-1.5 shadow-exec-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{selectedRisk.status === 'Mitigated' ? 'Treatment Mitigated' : 'Sign Off Treatment'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
