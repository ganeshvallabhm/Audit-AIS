import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClockCheck,
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  CloudUpload,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Flag,
  Gauge,
  LayoutGrid,
  ListChecks,
  Lock,
  MailCheck,
  Maximize2,
  Network,
  Pause,
  Play,
  Plus,
  PlusCircle,
  Printer,
  Send,
  Shield,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import {
  DashboardOverviewOut,
  DistributionRuleCreate,
  DistributionRuleOut,
  ReportDetailOut,
  ReportSuiteOut,
} from '../types/api';
import { DistributionRule, ReportSuite } from '../types/audit';

interface ReportsInsightsPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedSuite {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  onDemand: boolean;
  tags: string[];
  formatTag: string;
  icon: 'building' | 'shield' | 'grid' | 'alarm' | 'domain' | 'brain';
  primaryAction: string;
  secondaryAction: string;
}

export const ReportsInsightsPage: React.FC<ReportsInsightsPageProps> = ({ onNotify }) => {
  const navigate = useNavigate();
  const { mode, hasRole, user } = useAuth();
  const [fiscalPeriod, setFiscalPeriod] = useState('Q4 2025 (Current)');

  // API state
  const [apiSuites, setApiSuites] = useState<ReportSuiteOut[]>([]);
  const [apiDistributions, setApiDistributions] = useState<DistributionRuleOut[]>([]);
  const [dashboard, setDashboard] = useState<DashboardOverviewOut | null>(null);
  const [boardDetail, setBoardDetail] = useState<ReportDetailOut | null>(null);
  const [activeReportDetail, setActiveReportDetail] = useState<ReportDetailOut | null>(null);
  const [loading, setLoading] = useState(mode === 'api');
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Demo state
  const [demoSuites] = useState<ReportSuite[]>(() => auditService.getReportSuites());
  const [suiteCategory, setSuiteCategory] = useState<'All' | 'Statutory' | 'Operational'>('All');
  const [distributions, setDistributions] = useState<DistributionRule[]>(() =>
    auditService.getDistributionRules()
  );
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleSchedule, setRuleSchedule] = useState('Every Friday at 09:00 EST');
  const [ruleRecipients, setRuleRecipients] = useState('Audit Committee, Chief Audit Officer');
  const [ruleSuiteId, setRuleSuiteId] = useState('rep-board');
  const [ruleFormat, setRuleFormat] = useState<'pdf' | 'xlsx' | 'csv'>('pdf');

  const canManageDistributions = hasRole('Admin', 'Auditor', 'Management');

  const fetchReportsData = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const qsPeriod = encodeURIComponent(fiscalPeriod);
      const [suitesRes, dashRes, boardRes, distRes] = await Promise.all([
        apiClient.get<ReportSuiteOut[]>('/reports'),
        apiClient.get<DashboardOverviewOut>(`/dashboard?period=${qsPeriod}`),
        apiClient.get<ReportDetailOut>(`/reports/rep-board?period=${qsPeriod}`),
        apiClient.get<DistributionRuleOut[]>('/reports/distributions'),
      ]);
      setApiSuites(suitesRes);
      setDashboard(dashRes);
      setBoardDetail(boardRes);
      setApiDistributions(distRes);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load governance reports.');
    } finally {
      setLoading(false);
    }
  }, [mode, fiscalPeriod]);

  useEffect(() => {
    void fetchReportsData();
  }, [fetchReportsData]);

  const suites: UnifiedSuite[] = useMemo(() => {
    if (mode === 'api') {
      return apiSuites.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        updatedAt: s.updated_at,
        onDemand: s.on_demand,
        tags: s.tags,
        formatTag: s.format_tag,
        icon: s.icon,
        primaryAction: s.primary_action,
        secondaryAction: s.secondary_action,
      }));
    }
    return demoSuites.map((s) => ({
      ...s,
      onDemand: Boolean(s.onDemand),
    }));
  }, [mode, apiSuites, demoSuites]);

  const visibleSuites = useMemo(() => {
    if (suiteCategory === 'Statutory') {
      return suites.filter((s) =>
        s.tags.some((t) => ['Executive & Board', 'Auditor Certified', 'Quarterly', 'Compliance'].includes(t))
      );
    }
    if (suiteCategory === 'Operational') {
      return suites.filter((s) =>
        s.tags.some((t) => ['Risk Management', 'Operations & Audit', 'AI Analytics', 'Management'].includes(t))
      );
    }
    return suites;
  }, [suites, suiteCategory]);

  const renderSuiteIcon = (icon: UnifiedSuite['icon']) => {
    switch (icon) {
      case 'building':
        return <Building2 className="w-5 h-5" />;
      case 'shield':
        return <Shield className="w-5 h-5" />;
      case 'grid':
        return <LayoutGrid className="w-5 h-5" />;
      case 'alarm':
        return <AlarmClockCheck className="w-5 h-5" />;
      case 'domain':
        return <Building2 className="w-5 h-5" />;
      case 'brain':
        return <Brain className="w-5 h-5" />;
    }
  };

  const openReportPreview = async (reportId: string) => {
    if (mode === 'demo') {
      setActiveReportDetail(null);
      setPreviewModalOpen(true);
      return;
    }
    setLoadingReportId(reportId);
    try {
      const detail = await apiClient.get<ReportDetailOut>(
        `/reports/${encodeURIComponent(reportId)}?period=${encodeURIComponent(fiscalPeriod)}`
      );
      setActiveReportDetail(detail);
      setPreviewModalOpen(true);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to load report preview.');
    } finally {
      setLoadingReportId(null);
    }
  };

  const triggerBlobDownload = async (
    reportId: string,
    format: 'pdf' | 'xlsx' | 'csv',
    title: string
  ) => {
    if (mode === 'demo') {
      if (format === 'csv') {
        auditService.exportCsvRows(
          `CompanyAudit_${reportId}_Demo.csv`,
          ['Department', 'Audit Health Score', 'Target', 'Open Findings', 'Remediation Velocity'],
          [
            ['Finance & Treasury', '94%', '85%', 2, '96.2%'],
            ['Human Resources & Equity', '89%', '85%', 1, '93.5%'],
            ['Customer Operations & Support', '86%', '85%', 2, '91.0%'],
            ['Information Technology & SecOps', '76%', '85%', 6, '84.8%'],
          ]
        );
        onNotify(`Downloaded structured CSV data pack for "${title}" (Demo).`);
      } else if (format === 'pdf') {
        setActiveReportDetail(null);
        setPreviewModalOpen(true);
        setTimeout(() => window.print(), 150);
      } else {
        onNotify(`Real binary XLSX workbook generation runs in Live PostgreSQL API Mode.`);
      }
      return;
    }

    if (reportId === 'rep-ai' && format === 'csv') {
      // Allow export if requested directly, or navigate when using primary action
    }

    const key = `${reportId}-${format}`;
    setExportingKey(key);
    try {
      const { blob, filename } = await apiClient.downloadBlob(
        `/reports/${encodeURIComponent(reportId)}/export?format=${format}&period=${encodeURIComponent(fiscalPeriod)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(`Exported ${filename} (${format.toUpperCase()}) from live PostgreSQL telemetry.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : `Failed to export ${format.toUpperCase()} report.`);
    } finally {
      setExportingKey(null);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageDistributions || !ruleTitle.trim() || !ruleRecipients.trim()) return;

    if (mode === 'demo') {
      const created: DistributionRule = {
        id: `dist-${distributions.length + 1}`,
        title: ruleTitle.trim(),
        scheduleSummary: `${ruleSchedule.trim()} • ${ruleRecipients.trim()} (${ruleFormat.toUpperCase()})`,
        nextRun: 'Next Scheduled Dispatch',
        status: 'Active',
        icon: 'mail',
      };
      setDistributions((prev) => [created, ...prev]);
      setRuleTitle('');
      setNewRuleOpen(false);
      onNotify(`Created scheduled briefing rule: ${created.title} (Demo).`);
      return;
    }

    setSavingRule(true);
    try {
      const payload: DistributionRuleCreate = {
        name: ruleTitle.trim(),
        schedule_label: ruleSchedule.trim(),
        recipients: ruleRecipients.trim(),
        report_suite_id: ruleSuiteId,
        export_format: ruleFormat,
        icon: 'mail',
        is_active: true,
      };
      const created = await apiClient.post<DistributionRuleOut>('/reports/distributions', payload);
      setApiDistributions((prev) => [created, ...prev]);
      setRuleTitle('');
      setNewRuleOpen(false);
      onNotify(`Saved scheduled distribution rule "${created.name}" to PostgreSQL.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to create distribution rule.');
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleDistribution = async (rule: DistributionRuleOut) => {
    if (!canManageDistributions || mode !== 'api') return;
    try {
      const updated = await apiClient.put<DistributionRuleOut>(
        `/reports/distributions/${rule.id}`,
        { is_active: !rule.is_active }
      );
      setApiDistributions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      onNotify(`Distribution rule "${updated.name}" marked ${updated.is_active ? 'Active' : 'Paused'}.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to toggle distribution rule.');
    }
  };

  const handleDeleteDistribution = async (rule: DistributionRuleOut) => {
    if (!canManageDistributions || mode !== 'api') return;
    try {
      await apiClient.delete(`/reports/distributions/${rule.id}`);
      setApiDistributions((prev) => prev.filter((r) => r.id !== rule.id));
      onNotify(`Deleted distribution rule "${rule.name}".`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to delete distribution rule.');
    }
  };

  const isApi = mode === 'api';
  const compositeScore = isApi ? (dashboard ? Math.round(dashboard.composite_score) : null) : 82;
  const openFindingsCount = isApi ? (dashboard ? dashboard.open_findings_count : null) : 18;
  const criticalHighRisks = isApi ? (dashboard ? dashboard.critical_high_risks_count : null) : 3;
  const slaVelocity = isApi ? (dashboard ? dashboard.sla_compliance_pct : null) : 91.4;
  const forecastSlope = isApi ? (dashboard?.forecast?.slope_per_month ?? null) : 1.4;
  const completedAudits = isApi ? (dashboard ? dashboard.completed_audits_count : null) : 5;
  const totalAudits = isApi ? (dashboard ? dashboard.total_audits_count : null) : 7;

  const frameworkList = dashboard?.framework_compliance ?? [];
  const evaluatedFrameworks = isApi
    ? frameworkList.filter((f) => f.controls_evaluated > 0).length
    : 4;
  const totalFrameworks = isApi ? frameworkList.length : 4;
  const frameworkCodesLabel = isApi
    ? frameworkList.slice(0, 4).map((f) => f.framework).join(' • ') || 'Awaiting framework controls'
    : 'SOC 2 • ISO 27001 • GDPR • SOX 404';

  const deptShowcase = useMemo(() => {
    if (mode === 'api') {
      if (!dashboard) return [];
      return dashboard.departments.slice(0, 4).map((d) => ({
        name: d.name,
        score: d.score !== null ? Math.round(d.score) : null,
        attention: d.attention_area,
      }));
    }
    return [
      { name: 'Finance', score: 94 as number | null, attention: false },
      { name: 'HR Governance', score: 89 as number | null, attention: false },
      { name: 'Customer Ops', score: 86 as number | null, attention: false },
      { name: 'IT & SecOps', score: 76 as number | null, attention: true },
    ];
  }, [mode, dashboard]);

  const modalReport = activeReportDetail ?? boardDetail;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Standardized Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Analytics & Intelligence', to: '/dashboard' },
          { label: 'Executive Reports' },
        ]}
        badge={<StatusBadge tone="info">{dashboard ? dashboard.fiscal_year : 'Q4 Active'}</StatusBadge>}
        title="Reports & Governance Insights"
        description="Generate live PostgreSQL fiduciary audit packages, statutory compliance disclosures, and board-ready executive summaries."
        actions={
          <>
            <div className="relative inline-flex items-center bg-surface-container-lowest h-10 px-3.5 rounded-lg border border-border-hairline shadow-exec-sm">
              <Calendar className="w-4 h-4 text-secondary mr-2 shrink-0" />
              <select
                value={fiscalPeriod}
                onChange={(e) => setFiscalPeriod(e.target.value)}
                aria-label="Fiscal Year Selector"
                className="bg-transparent text-label-lg text-on-surface focus:outline-none cursor-pointer pr-2"
              >
                <option>Q4 2025 (Current)</option>
                <option>Q3 2025 (Archived)</option>
                <option>Q2 2025 (Archived)</option>
                <option>FY 2024 Retrospective</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => navigate('/ai-assistant')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest text-on-surface border border-border-hairline text-label-lg shadow-exec-sm hover:bg-surface-container-low transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-secondary" />
              <span>AI Brief Composer</span>
            </button>

            <button
              type="button"
              onClick={() => openReportPreview('rep-board')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg shadow-exec-sm hover:bg-secondary-container transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Export Board Briefing</span>
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

      {/* Executive Stat Cards */}
      <section aria-label="Reporting Readiness Metrics" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <KpiCard
          eyebrow="Audit Health Index"
          badgeText={
            compositeScore === null
              ? 'Loading'
              : compositeScore >= (dashboard?.enterprise_target ?? 85)
                ? 'Target Met'
                : 'Tracking'
          }
          badgeTone="secondary"
          badgeIcon={<span className="w-1.5 h-1.5 rounded-full bg-secondary" />}
          value={compositeScore !== null ? String(compositeScore) : '—'}
          suffix={<span className="text-headline-md text-on-surface-variant font-medium">/ 100</span>}
          footerLeft={
            <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
              <TrendingUp className="w-4 h-4 text-secondary" />{' '}
              {forecastSlope !== null
                ? isApi && dashboard?.forecast?.is_sufficient_for_forecast === false
                  ? 'Forecast needs >=3 monthly points'
                  : `${forecastSlope >= 0 ? '+' : ''}${forecastSlope}%/mo slope`
                : 'Syncing telemetry...'}
            </span>
          }
          footerRight={dashboard ? `${dashboard.enterprise_target}% Target` : isApi ? 'Enterprise Target' : 'Compliant Tier-1'}
          progress={compositeScore ?? 0}
        />

        <KpiCard
          eyebrow="Statutory Frameworks"
          badgeText={isApi ? (dashboard ? 'Evaluated' : 'Syncing') : 'Current'}
          badgeTone="info"
          badgeIcon={<BadgeCheck className="w-3.5 h-3.5" />}
          value={isApi && !dashboard ? '—' : `${evaluatedFrameworks} / ${totalFrameworks}`}
          suffix={<span className="text-headline-sm text-secondary font-bold">Tracked</span>}
          footerLeft={<span className="font-mono text-label-sm">{frameworkCodesLabel}</span>}
          footerRight={
            <span className="text-secondary font-semibold">
              {totalFrameworks > 0 ? `${Math.round((evaluatedFrameworks / totalFrameworks) * 100)}% Scope` : '0% Scope'}
            </span>
          }
          progress={totalFrameworks > 0 ? Math.round((evaluatedFrameworks / totalFrameworks) * 100) : 0}
        />

        <KpiCard
          eyebrow="Audit Pack Readiness"
          badgeText={completedAudits !== null ? 'Validated' : 'Syncing'}
          badgeTone="neutral"
          badgeIcon={<Lock className="w-3.5 h-3.5" />}
          value={completedAudits !== null && totalAudits !== null ? `${completedAudits} / ${totalAudits}` : '—'}
          suffix={<span className="text-headline-sm text-on-surface font-semibold">Audits</span>}
          footerLeft={
            openFindingsCount !== null
              ? `${openFindingsCount} open findings across portfolio`
              : 'Loading open findings...'
          }
          footerRight={<span className="font-medium text-on-surface">{isApi ? 'Live Snapshot' : 'Demo Snapshot'}</span>}
          progress={
            totalAudits !== null && totalAudits > 0 && completedAudits !== null
              ? Math.round((completedAudits / totalAudits) * 100)
              : 0
          }
          progressFillClass="bg-primary-container"
        />
      </section>

      {/* Featured Executive Briefing Card */}
      <section className="w-full bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden flex flex-col xl:flex-row">
        {/* Left Editorial Panel */}
        <div className="xl:w-7/12 p-6 lg:p-8 flex flex-col justify-between gap-6 bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface-container-low/70">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge tone="navy">Quarterly Flagship Deliverable</StatusBadge>
              <span className="font-mono text-label-sm text-on-surface-variant">
                REF: GRC-2025-EXEC • {isApi ? 'LIVE POSTGRESQL TELEMETRY' : 'DEMO SNAPSHOT'}
              </span>
            </div>

            <h2 className="text-display-md text-primary font-extrabold tracking-tight leading-snug">
              {boardDetail ? boardDetail.title : 'Enterprise Audit & Fiduciary Assurance Briefing'}
            </h2>

            <p className="text-body-md text-on-surface-variant max-w-2xl leading-relaxed">
              {boardDetail
                ? boardDetail.executive_summary
                : 'Comprehensive quarterly assessment prepared for the Audit Committee & Board of Directors. Synthesizes statutory compliance postures, residual exposure trajectories, and remediation SLAs.'}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-label-md text-on-surface-variant pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-secondary" /> Generated{' '}
                {boardDetail ? new Date(boardDetail.generated_at).toLocaleDateString() : isApi ? 'Pending' : 'Live'}
              </span>
              <span className="text-outline-variant">•</span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-secondary" /> {user?.full_name || 'Office of the CAO'}
              </span>
              <span className="text-outline-variant">•</span>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-secondary" /> {totalAudits ?? '—'} Audit Schedules
              </span>
              <span className="text-outline-variant">•</span>
              <span className="inline-flex items-center gap-1.5 text-error font-semibold">
                <Flag className="w-4 h-4" /> {openFindingsCount ?? '—'} Open Findings
              </span>
            </div>
          </div>

          {/* Inline Functional Breakdown */}
          <div className="bg-surface-container-low/80 border border-border-hairline/70 rounded-xl p-5 flex flex-col gap-4">
            <span className="text-headline-sm text-primary font-bold">Audited Divisional Performance Breakdown</span>
            {deptShowcase.length === 0 ? (
              <div className="text-body-sm text-outline py-2">
                {loading ? 'Loading live departmental scorecards...' : 'No divisional telemetry available for selected period.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {deptShowcase.map((d) => (
                  <div key={d.name} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-label-sm gap-1">
                      <span className="text-on-surface-variant font-medium truncate" title={d.name}>
                        {d.name}
                      </span>
                      <span className={`font-mono font-bold ${d.attention ? 'text-error' : 'text-on-surface'}`}>
                        {d.score !== null ? `${d.score}%` : 'Unrated'}
                      </span>
                    </div>
                    <ProgressBar
                      value={d.score ?? 0}
                      heightClass="h-1.5"
                      fillClass={d.attention ? 'bg-error' : 'bg-secondary'}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-surface-container text-on-surface-variant text-body-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-on-surface">
                <Gauge className="w-4 h-4 text-secondary" /> SLA Compliance Velocity:{' '}
                {slaVelocity !== null ? `${slaVelocity}% on-time` : '—'}
              </span>
              <span className="font-mono text-label-sm text-secondary font-semibold">
                Target: {dashboard?.enterprise_target ?? 85}.0%
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openReportPreview('rep-board')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary-container text-on-primary text-label-lg hover:bg-primary shadow-exec-sm transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span>Preview Briefing</span>
            </button>
            <button
              type="button"
              disabled={exportingKey === 'rep-board-pdf'}
              onClick={() => triggerBlobDownload('rep-board', 'pdf', 'Board Audit Package')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-50 transition-colors shadow-exec-sm"
            >
              <Download className="w-4 h-4" />
              <span>{exportingKey === 'rep-board-pdf' ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>
            <button
              type="button"
              disabled={exportingKey === 'rep-board-xlsx'}
              onClick={() => triggerBlobDownload('rep-board', 'xlsx', 'Board Audit Package')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-low border border-border-hairline text-on-surface text-label-lg hover:bg-surface-container disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-secondary" />
              <span>{exportingKey === 'rep-board-xlsx' ? 'Exporting...' : 'Export XLSX'}</span>
            </button>
            <button
              type="button"
              disabled={exportingKey === 'rep-board-csv'}
              onClick={() => triggerBlobDownload('rep-board', 'csv', 'Board Audit Package')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-low border border-border-hairline text-on-surface text-label-lg hover:bg-surface-container disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4 text-secondary" />
              <span>CSV Pack</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewModalOpen(true);
                setTimeout(() => window.print(), 150);
              }}
              className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed text-label-md hover:bg-primary-fixed transition-colors xl:ml-auto"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Right Interactive Document Preview Canvas */}
        <div className="xl:w-5/12 bg-surface-container/70 p-6 lg:p-8 flex flex-col justify-center items-center border-t xl:border-t-0 xl:border-l border-border-hairline/70">
          <div className="w-full max-w-sm bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-secondary-container inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block" />
              </div>
              <span className="font-mono text-label-sm text-on-surface-variant">CONFIDENTIAL // BOARD-ONLY</span>
            </div>

            <div className="relative w-full h-44 rounded-lg bg-primary-container overflow-hidden flex flex-col justify-end p-4 text-on-primary">
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 80% 20%, #316bf3 0%, transparent 55%), linear-gradient(135deg, #001f43 0%, #000615 100%)',
                }}
              />
              <div className="relative z-10 flex flex-col">
                <span className="text-label-sm text-secondary-fixed font-bold uppercase tracking-wider">
                  Board of Directors Presentation
                </span>
                <span className="text-headline-md font-bold leading-tight mt-1">
                  Enterprise Fiduciary Assurance
                </span>
                <span className="text-body-sm text-on-primary-container mt-0.5">
                  {dashboard?.company_name || (isApi ? 'Enterprise Telemetry' : 'CompanyAudit Enterprise')} •{' '}
                  {fiscalPeriod}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-secondary" /> Composite Score
                </span>
                <span className="font-mono font-bold text-on-surface">
                  {compositeScore !== null ? `${compositeScore}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low">
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-secondary" /> SLA Compliance
                </span>
                <span className="font-mono font-bold text-secondary">
                  {slaVelocity !== null ? `${slaVelocity}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-error" /> Critical / High Risks
                </span>
                <span className="font-mono font-bold text-error">
                  {criticalHighRisks !== null ? `${criticalHighRisks} ACTIVE` : '—'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-label-sm text-outline">
                {isApi ? 'Database Grounded' : 'Demo Snapshot'}
              </span>
              <button
                type="button"
                onClick={() => openReportPreview('rep-board')}
                className="inline-flex items-center gap-1.5 text-secondary text-label-lg hover:underline"
              >
                <span>Expand View</span>
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Curated Report Suites Section */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-headline-lg text-primary font-bold tracking-tight">
              Curated Governance &amp; Audit Suites
            </h3>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Live database snapshots, statutory cross-walks, and operational risk telemetry exports.
            </p>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-surface-container-low border border-border-hairline/80 self-start md:self-auto">
            {(['All', 'Statutory', 'Operational'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSuiteCategory(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-label-md transition-colors ${
                  suiteCategory === cat
                    ? 'bg-surface-container-lowest text-primary font-bold shadow-exec-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {cat === 'All' ? `All Suites (${suites.length})` : cat}
              </button>
            ))}
          </div>
        </div>

        {mode === 'api' && loading && suites.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading report suites...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleSuites.map((suite) => (
              <div
                key={suite.id}
                className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm hover:shadow-exec-md transition-shadow flex flex-col justify-between group"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-low border border-border-hairline flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
                      {renderSuiteIcon(suite.icon)}
                    </div>
                    {suite.onDemand ? (
                      <StatusBadge dot tone="secondary">
                        {suite.updatedAt}
                      </StatusBadge>
                    ) : (
                      <span className="font-mono text-label-sm text-outline">{suite.updatedAt}</span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-headline-md text-primary font-bold group-hover:text-secondary transition-colors">
                      {suite.title}
                    </h4>
                    <p className="text-body-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                      {suite.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {suite.tags.map((tag) => (
                      <StatusBadge key={tag} tone="neutral">
                        {tag}
                      </StatusBadge>
                    ))}
                    <StatusBadge tone="info">{suite.formatTag}</StatusBadge>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-4 mt-5 border-t border-surface-container flex-wrap">
                  {suite.id === 'rep-ai' ? (
                    <button
                      type="button"
                      onClick={() => navigate('/ai-assistant')}
                      className="text-secondary text-label-lg hover:underline inline-flex items-center gap-1.5"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Open AI Copilot</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {(['pdf', 'xlsx', 'csv'] as const).map((fmt) => {
                        const isExporting = exportingKey === `${suite.id}-${fmt}`;
                        return (
                          <button
                            key={fmt}
                            type="button"
                            disabled={isExporting || loadingReportId === suite.id}
                            onClick={() => void triggerBlobDownload(suite.id, fmt, suite.title)}
                            aria-label={`Export ${fmt.toUpperCase()} for ${suite.title}`}
                            className={`h-7 px-2.5 rounded-md font-mono text-label-sm font-bold transition-colors disabled:opacity-50 ${
                              fmt === 'pdf'
                                ? 'bg-secondary text-on-secondary hover:bg-secondary-container'
                                : 'bg-surface-container-low border border-border-hairline text-on-surface hover:bg-surface-container'
                            }`}
                          >
                            {isExporting ? '...' : fmt.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={loadingReportId === suite.id}
                    onClick={() => openReportPreview(suite.id)}
                    className="text-on-surface-variant text-label-md hover:text-on-surface inline-flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{loadingReportId === suite.id ? 'Loading...' : 'Inspect'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled & Automated Distributions Tray */}
      <section className="bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container-low border border-border-hairline flex items-center justify-center text-secondary shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-headline-md text-primary font-bold">Scheduled Governance Distributions</h4>
              <p className="text-body-sm text-on-surface-variant">
                Configured executive broadcast schedules verified against organizational digest settings
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!canManageDistributions}
            onClick={() => setNewRuleOpen(true)}
            title={
              canManageDistributions
                ? 'Configure a distribution rule'
                : 'Admin, Auditor, or Management role required'
            }
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed text-label-md hover:bg-primary-fixed disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Distribution Rule</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {mode === 'api' ? (
            apiDistributions.length === 0 ? (
              <div className="p-5 rounded-xl bg-surface-container-low/70 border border-border-hairline text-body-sm text-on-surface-variant">
                No automated distribution rules saved in PostgreSQL yet.
              </div>
            ) : (
              apiDistributions.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60 hover:bg-surface-container transition-colors gap-3"
                >
                  <div className="flex items-center gap-3.5">
                    {rule.icon === 'hub' ? (
                      <Network className="w-5 h-5 text-secondary shrink-0" />
                    ) : rule.icon === 'cloud' ? (
                      <CloudUpload className="w-5 h-5 text-secondary shrink-0" />
                    ) : (
                      <MailCheck className="w-5 h-5 text-secondary shrink-0" />
                    )}
                    <div>
                      <span className="text-headline-sm text-on-surface font-semibold block">{rule.name}</span>
                      <span className="text-body-sm text-on-surface-variant">
                        {rule.schedule_label} • {rule.recipients}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 ml-auto md:ml-0 flex-wrap">
                    <span className="font-mono text-label-sm text-on-surface-variant bg-surface-container-lowest border border-border-hairline px-2.5 py-1 rounded-lg uppercase">
                      {rule.report_suite_id} ({rule.export_format})
                    </span>
                    <StatusBadge dot tone={rule.is_active ? 'success' : 'neutral'}>
                      {rule.is_active ? 'Active' : 'Paused'}
                    </StatusBadge>
                    {canManageDistributions && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleToggleDistribution(rule)}
                          title={rule.is_active ? 'Pause rule' : 'Activate rule'}
                          aria-label={rule.is_active ? `Pause ${rule.name}` : `Activate ${rule.name}`}
                          className="p-1.5 rounded-lg border border-border-hairline bg-surface-container-lowest text-on-surface-variant hover:text-secondary transition-colors"
                        >
                          {rule.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDistribution(rule)}
                          title="Delete distribution rule"
                          aria-label={`Delete ${rule.name}`}
                          className="p-1.5 rounded-lg border border-border-hairline bg-surface-container-lowest text-on-surface-variant hover:text-error transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            distributions.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60 hover:bg-surface-container transition-colors gap-3"
              >
                <div className="flex items-center gap-3.5">
                  {rule.icon === 'mail' ? (
                    <MailCheck className="w-5 h-5 text-secondary shrink-0" />
                  ) : rule.icon === 'hub' ? (
                    <Network className="w-5 h-5 text-secondary shrink-0" />
                  ) : (
                    <CloudUpload className="w-5 h-5 text-secondary shrink-0" />
                  )}
                  <div>
                    <span className="text-headline-sm text-on-surface font-semibold block">{rule.title}</span>
                    <span className="text-body-sm text-on-surface-variant">{rule.scheduleSummary}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 ml-auto md:ml-0">
                  <span className="font-mono text-label-sm text-on-surface-variant bg-surface-container-lowest border border-border-hairline px-3 py-1 rounded-lg">
                    {rule.nextRun}
                  </span>
                  <StatusBadge dot tone="success">
                    {rule.status}
                  </StatusBadge>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Full Live Report Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setPreviewModalOpen(false)} />
          <div className="relative w-full max-w-3xl bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10 flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 bg-primary-container text-on-primary flex items-center justify-between">
              <div>
                <div className="font-mono text-label-sm text-secondary-fixed">
                  {modalReport ? `${modalReport.id.toUpperCase()} • ${modalReport.fiscal_year}` : 'GRC-2025-Q4-EXEC'}
                </div>
                <h3 className="text-headline-lg font-bold">
                  {modalReport ? modalReport.title : 'Enterprise Audit & Fiduciary Assurance Briefing'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-body-md text-on-surface">
              <div className="p-4 rounded-xl bg-surface-container-low border border-border-hairline flex flex-wrap justify-between gap-4">
                <div>
                  <span className="text-label-sm uppercase text-outline block">Organization</span>
                  <strong>{modalReport?.company_name || dashboard?.company_name || 'Enterprise Corp'}</strong>
                </div>
                <div>
                  <span className="text-label-sm uppercase text-outline block">Composite Score</span>
                  <strong className="text-secondary font-mono">
                    {compositeScore !== null ? `${compositeScore} / 100` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-label-sm uppercase text-outline block">SLA Compliance</span>
                  <strong className="font-mono text-label-sm">
                    {slaVelocity !== null ? `${slaVelocity}% ON-TIME` : '—'}
                  </strong>
                </div>
              </div>

              <div>
                <h4 className="text-headline-md font-bold mb-1.5">1. Executive Governance Summary</h4>
                <p className="text-on-surface-variant leading-relaxed">
                  {modalReport
                    ? modalReport.executive_summary
                    : 'Internal controls operate across SOX 404b, SOC 2 Type II, and GDPR obligations with active divisional monitoring.'}
                </p>
              </div>

              {modalReport?.sections?.map((sec) => (
                <div key={sec.heading} className="space-y-2.5">
                  <h4 className="text-headline-md font-bold">{sec.heading}</h4>
                  {sec.metrics && sec.metrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {sec.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="p-3 rounded-lg bg-surface-container-low/80 border border-border-hairline"
                        >
                          <span className="text-label-sm text-outline block">{m.label}</span>
                          <span className="font-mono text-headline-sm font-bold text-primary">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sec.items && sec.items.length > 0 && (
                    <div className="space-y-2">
                      {sec.items.map((item) => (
                        <div
                          key={item.code}
                          className="p-3 rounded-lg bg-error-container/25 border border-error/25 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-semibold text-primary">
                              {item.code} — {item.name}
                            </div>
                            {item.note && <div className="text-body-sm text-on-surface-variant">{item.note}</div>}
                          </div>
                          <div className="text-right font-mono text-label-md shrink-0">
                            <div className="font-bold text-error">
                              {item.score !== null && item.score !== undefined ? `${item.score}%` : 'Unrated'} / {item.target}%
                            </div>
                            <div className="text-label-sm text-outline">{item.open_findings} open findings</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() =>
                  void triggerBlobDownload(
                    modalReport?.id || 'rep-board',
                    'csv',
                    modalReport?.title || 'Governance Briefing'
                  )
                }
                className="h-10 px-4 rounded-lg bg-surface-container-highest text-primary text-label-lg inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void triggerBlobDownload(
                    modalReport?.id || 'rep-board',
                    'xlsx',
                    modalReport?.title || 'Governance Briefing'
                  )
                }
                className="h-10 px-4 rounded-lg bg-surface-container-highest text-primary text-label-lg inline-flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>XLSX</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void triggerBlobDownload(
                    modalReport?.id || 'rep-board',
                    'pdf',
                    modalReport?.title || 'Governance Briefing'
                  )
                }
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 px-3.5 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-md inline-flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Distribution Rule Modal */}
      {newRuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setNewRuleOpen(false)} />
          <form
            onSubmit={handleAddRule}
            className="relative w-full max-w-md bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg p-6 z-10 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-headline-lg font-bold text-primary">New Distribution Rule</h3>
              <button type="button" onClick={() => setNewRuleOpen(false)}>
                <X className="w-5 h-5 text-outline" />
              </button>
            </div>
            <div>
              <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Pipeline Name</label>
              <input
                type="text"
                required
                minLength={3}
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder="e.g. Bi-Weekly SecOps SLA Exception Brief"
                className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md"
              />
            </div>
            <div>
              <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                Schedule Cadence
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={ruleSchedule}
                onChange={(e) => setRuleSchedule(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md"
              />
            </div>
            <div>
              <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                Recipients
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={ruleRecipients}
                onChange={(e) => setRuleRecipients(e.target.value)}
                placeholder="e.g. Board Audit Committee, CAO"
                className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Report Suite</label>
                <select
                  value={ruleSuiteId}
                  onChange={(e) => setRuleSuiteId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                >
                  <option value="rep-board">Executive Board Package</option>
                  <option value="rep-statutory">Statutory Compliance</option>
                  <option value="rep-risk">Enterprise Risk Matrix</option>
                  <option value="rep-sla">SLA Velocity Pack</option>
                  <option value="rep-dept">Departmental Scorecard</option>
                </select>
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Format</label>
                <select
                  value={ruleFormat}
                  onChange={(e) => setRuleFormat(e.target.value as 'pdf' | 'xlsx' | 'csv')}
                  className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest uppercase"
                >
                  <option value="pdf">PDF</option>
                  <option value="xlsx">XLSX</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewRuleOpen(false)}
                className="h-9 px-4 rounded-lg border border-border-hairline text-label-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRule}
                className="h-9 px-4 rounded-lg bg-secondary text-on-secondary disabled:opacity-50 text-label-md"
              >
                {savingRule ? 'Saving...' : 'Activate Rule'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
