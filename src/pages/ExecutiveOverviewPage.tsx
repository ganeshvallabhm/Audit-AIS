import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiCard } from '../components/ui/KpiCard';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { DashboardOverviewOut } from '../types/api';
import { PrioritySignoffFinding } from '../types/audit';

interface ExecutiveOverviewPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedSignoffRow {
  id: string;
  code: string;
  title: string;
  department: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  criticalityLabel: string;
  leadInitials: string;
  leadName: string;
  targetResolution: string;
  signedOff: boolean;
  rootCause?: string;
}

export const ExecutiveOverviewPage: React.FC<ExecutiveOverviewPageProps> = ({ onNotify }) => {
  const navigate = useNavigate();
  const { mode, hasRole } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const [period, setPeriod] = useState('Q4 2025 (Current)');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [showModelDetails, setShowModelDetails] = useState(false);

  // API state
  const [dashboard, setDashboard] = useState<DashboardOverviewOut | null>(null);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signingOffId, setSigningOffId] = useState<string | null>(null);

  // Demo fallback state
  const [demoSignoffList, setDemoSignoffList] = useState<PrioritySignoffFinding[]>(() =>
    auditService.getPrioritySignoffs()
  );

  const canSignOff = hasRole('Admin', 'Management');
  const canCreateAudit = hasRole('Admin', 'Auditor');

  const fetchDashboard = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiClient.get<DashboardOverviewOut>(
        `/dashboard?period=${encodeURIComponent(period)}`
      );
      setDashboard(data);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load executive analytics.');
    } finally {
      setLoading(false);
    }
  }, [mode, period]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const demoTrendData = useMemo(() => auditService.getPerformanceTrend(period), [period]);
  const demoTopDepartments = useMemo(() => auditService.getDepartmentHealth().slice(0, 4), []);

  const trendData = useMemo(() => {
    if (mode === 'api' && dashboard) {
      return dashboard.performance_trend;
    }
    return demoTrendData;
  }, [mode, dashboard, demoTrendData]);

  const targetThreshold = dashboard?.enterprise_target ?? 85;
  const minFloor = dashboard?.minimum_floor ?? 80;

  const topDepartments = useMemo(() => {
    if (mode === 'api' && dashboard) {
      return dashboard.departments.slice(0, 4).map((d) => ({
        id: d.id,
        name: d.name,
        score: d.score ?? 0,
        attentionArea: d.attention_area,
        note: d.attention_note,
      }));
    }
    return demoTopDepartments;
  }, [mode, dashboard, demoTopDepartments]);

  const signoffRows: UnifiedSignoffRow[] = useMemo(() => {
    if (mode === 'api' && dashboard) {
      return dashboard.priority_signoffs.map((f) => ({
        id: f.id,
        code: f.code,
        title: f.title,
        department: f.department_name,
        severity: f.severity,
        criticalityLabel:
          f.severity === 'Critical'
            ? 'Tier 1 Critical'
            : f.severity === 'High'
              ? 'High Risk'
              : `${f.severity} Risk`,
        leadInitials: f.owner_initials,
        leadName: f.owner_name,
        targetResolution: f.target_sla_date,
        signedOff: f.status === 'Closed' || Boolean(f.signed_off_at),
        rootCause: f.root_cause,
      }));
    }
    return demoSignoffList.map((item) => ({
      id: item.id,
      code: item.id,
      title: item.title,
      department: item.department,
      severity:
        item.criticality === 'Tier 1 Critical'
          ? 'Critical'
          : item.criticality === 'High Risk'
            ? 'High'
            : 'Medium',
      criticalityLabel: item.criticality,
      leadInitials: item.leadInitials,
      leadName: item.leadName,
      targetResolution: item.targetResolution,
      signedOff: Boolean(item.signedOff),
    }));
  }, [mode, dashboard, demoSignoffList]);

  const visibleFindings = useMemo(() => {
    if (!pendingOnly) return signoffRows;
    return signoffRows.filter((item) => !item.signedOff);
  }, [signoffRows, pendingOnly]);

  const handleSignOff = async (row: UnifiedSignoffRow) => {
    if (!canSignOff) {
      onNotify('Only Admin or Management roles can authorize executive finding sign-offs.');
      return;
    }

    if (mode === 'demo') {
      setDemoSignoffList((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, signedOff: !item.signedOff } : item))
      );
      if (!row.signedOff) {
        onNotify(`Executive sign-off recorded for ${row.code} (${row.department}).`);
      } else {
        onNotify(`Sign-off status reverted for ${row.code}.`);
      }
      return;
    }

    setSigningOffId(row.id);
    try {
      await apiClient.put(`/findings/${row.id}`, {
        sign_off: true,
        management_response: 'Executive sign-off confirmed from Executive Overview governance queue.',
      });
      onNotify(`Executive sign-off recorded in PostgreSQL ledger for ${row.code}.`);
      await fetchDashboard();
      await refreshNotifications();
    } catch (err) {
      onNotify(err instanceof ApiError ? `Sign-off failed: ${err.detail}` : 'Sign-off request failed.');
    } finally {
      setSigningOffId(null);
    }
  };

  const handleExportBriefing = () => {
    auditService.exportCsvRows(
      `CompanyAudit_Executive_Briefing_${period.replace(/\s+/g, '_')}.csv`,
      ['Finding Code', 'Title', 'Department', 'Criticality', 'Responsible Lead', 'Target SLA', 'Signed Off'],
      signoffRows.map((f) => [
        f.code,
        f.title,
        f.department,
        f.criticalityLabel,
        f.leadName,
        f.targetResolution,
        f.signedOff ? 'Yes' : 'Pending',
      ])
    );
    onNotify(`Exported Executive Briefing summary pack for ${period}.`);
  };

  if (mode === 'api' && loading && !dashboard) {
    return (
      <div className="flex flex-col gap-8 w-full">
        <PageHeader
          eyebrow="Fiduciary Governance & Oversight"
          title="Executive Overview"
          description="Loading real-time enterprise audit telemetry from PostgreSQL..."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-36 rounded-xl bg-surface-container-lowest border border-border-hairline animate-pulse p-6"
            />
          ))}
        </div>
        <div className="h-96 rounded-xl bg-surface-container-lowest border border-border-hairline animate-pulse" />
      </div>
    );
  }

  const compositeScore = dashboard ? dashboard.composite_score : 82;
  const criticalHighRisks = dashboard ? dashboard.critical_high_risks_count : 3;
  const boardCap = dashboard ? dashboard.board_risk_threshold : 5;
  const totalAudits = dashboard ? dashboard.total_audits_count : 7;
  const activeAudits = dashboard ? dashboard.active_audits_count : 2;
  const completedAudits = dashboard ? dashboard.completed_audits_count : 5;
  const slaVelocity = dashboard ? dashboard.sla_compliance_pct : 91.4;
  const openFindingsCount = dashboard ? dashboard.open_findings_count : 18;
  const overdueCount = dashboard ? dashboard.overdue_findings_count : 0;
  const forecast = dashboard?.forecast;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Standardized Executive Header */}
      <PageHeader
        eyebrow="Fiduciary Governance & Oversight"
        title="Executive Overview"
        description={
          dashboard
            ? `${dashboard.company_name} — ${dashboard.fiscal_year}. Live enterprise audit posture & Scikit-learn forecasting.`
            : 'Enterprise audit posture, key risk indicators, and operational benchmarks across all business units.'
        }
        actions={
          <>
            <div className="relative">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label="Reporting Period"
                className="appearance-none h-10 bg-surface-container-lowest text-on-surface text-label-lg pl-3.5 pr-9 rounded-lg border border-border-hairline shadow-exec-sm focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/15 cursor-pointer"
              >
                <option>Q4 2025 (Current)</option>
                <option>Q3 2025 (Archived)</option>
                <option>Q2 2025 (Archived)</option>
                <option>FY 2024 Retrospective</option>
              </select>
              <ChevronDown className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline" />
            </div>

            <button
              type="button"
              onClick={handleExportBriefing}
              className="inline-flex items-center gap-2 h-10 px-4 bg-surface-container-lowest text-on-surface text-label-lg rounded-lg border border-border-hairline shadow-exec-sm hover:bg-surface-container-low transition-colors"
            >
              <Download className="w-4 h-4 text-secondary" />
              <span>Export Briefing</span>
            </button>

            <button
              type="button"
              disabled={!canCreateAudit}
              onClick={() => navigate('/audits?initiate=1')}
              title={canCreateAudit ? 'Initiate a new audit engagement' : 'Admin or Auditor role required'}
              className="inline-flex items-center gap-2 h-10 px-4 bg-secondary text-on-secondary text-label-lg rounded-lg shadow-exec-sm hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Audit</span>
            </button>
          </>
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-body-sm font-medium">
            <AlertCircle className="w-5 h-5 text-error shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchDashboard()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-label-md font-bold text-primary border border-border-hairline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Primary KPI Strip (4 Balanced Cards) */}
      <section aria-label="Executive Key Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          eyebrow="Overall Audit Score"
          badgeText={compositeScore >= minFloor ? 'Compliant' : 'Attention'}
          badgeTone={compositeScore >= minFloor ? 'secondary' : 'danger'}
          value={`${compositeScore.toFixed(1)}%`}
          delta={forecast ? `${forecast.slope_per_month >= 0 ? '+' : ''}${forecast.slope_per_month.toFixed(2)}%/mo` : '+6.4%'}
          footerLeft={`Min floor ${minFloor.toFixed(1)}% (Target ${targetThreshold.toFixed(1)}%)`}
          progress={compositeScore}
        />

        <KpiCard
          eyebrow="Open Critical & High Risks"
          badgeText={criticalHighRisks <= boardCap ? 'Within Tolerance' : 'Board Escalated'}
          badgeTone={criticalHighRisks <= boardCap ? 'neutral' : 'danger'}
          value={String(criticalHighRisks)}
          suffix={<span className="text-label-md text-outline font-medium">/ {boardCap} board cap</span>}
          footerLeft={
            dashboard
              ? `${dashboard.risk_distribution.total_risks} active enterprise risk registers`
              : 'Zero high-tier financial exposure'
          }
          progress={Math.min(100, Math.round((criticalHighRisks / Math.max(1, boardCap)) * 100))}
          onClick={() => navigate('/risk-and-compliance')}
        />

        <KpiCard
          eyebrow="Audit Engagements"
          badgeText="FY25 Cycle"
          badgeTone="info"
          value={String(totalAudits)}
          suffix={<span className="text-label-md text-outline font-medium">Programs</span>}
          footerLeft={
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-on-surface">
                <span className="w-2 h-2 rounded-full bg-secondary" /> {activeAudits} Active
              </span>
              <span className="text-outline-variant">•</span>
              <span>{completedAudits} Closed</span>
            </span>
          }
          progress={totalAudits > 0 ? Math.round((completedAudits / totalAudits) * 100) : 0}
          onClick={() => navigate('/audits')}
        />

        <KpiCard
          eyebrow="Remediation Velocity"
          badgeText="SLA Verified"
          badgeTone={overdueCount === 0 ? 'success' : 'warning'}
          value={`${slaVelocity.toFixed(1)}%`}
          delta={overdueCount > 0 ? `${overdueCount} Overdue` : 'On Track'}
          footerLeft={`${openFindingsCount} open findings across enterprise`}
          progress={slaVelocity}
          onClick={() => navigate('/findings-and-actions')}
        />
      </section>

      {/* Analytical Split: Trajectory Chart (7 Cols) + Departmental Health (5 Cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left: Audit Performance Trend */}
        <div className="xl:col-span-7 bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-headline-lg text-primary">Audit Performance Trend</h2>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Rolling monthly composite trajectory toward the {targetThreshold}% Q4 Board target
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2 text-label-md text-on-surface-variant">
                  <span className="w-3 h-0.5 bg-secondary inline-block rounded" />
                  <span>Actuals</span>
                </div>
                <div className="flex items-center gap-2 text-label-md text-outline">
                  <span className="w-3 h-0.5 border-t border-dashed border-secondary inline-block" />
                  <span>Target ({targetThreshold}%)</span>
                </div>
              </div>
            </div>

            <div className="w-full h-72 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 16, right: 20, left: -12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="auditPerfGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0051d5" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#0051d5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#dce9ff" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={{ stroke: '#dce9ff' }}
                    tickLine={false}
                    tick={{ fill: '#44474d', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                  />
                  <YAxis
                    domain={[55, 92]}
                    ticks={[55, 65, 75, 85]}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#696c74', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#d9e2f0',
                      borderRadius: '10px',
                      fontSize: '13px',
                      boxShadow: '0 4px 6px -1px rgba(11, 31, 58, 0.08)',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Composite Score']}
                  />
                  <ReferenceLine
                    y={targetThreshold}
                    stroke="#0051d5"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#0051d5"
                    isAnimationActive={false}
                    strokeWidth={3}
                    fill="url(#auditPerfGradient)"
                    dot={(props) => {
                      const { cx, cy, index } = props;
                      if (cx == null || cy == null) return <g key={index} />;
                      const isLast = index === trendData.length - 1;
                      if (isLast) {
                        return (
                          <circle
                            key={index}
                            cx={cx}
                            cy={cy}
                            r={5.5}
                            fill="#0051d5"
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        );
                      }
                      return (
                        <circle
                          key={index}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#ffffff"
                          stroke="#0051d5"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6, fill: '#0051d5', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-surface-container flex flex-col gap-3">
            <div className="bg-surface-container-low/70 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-secondary shrink-0" />
                <span className="text-body-sm text-on-surface font-medium">
                  {forecast
                    ? forecast.predicted_days_ahead_or_behind >= 0
                      ? `Target convergence predicted ${forecast.predicted_days_ahead_or_behind} days ahead (${forecast.confidence_label}).`
                      : `Target convergence projected ${Math.abs(forecast.predicted_days_ahead_or_behind)} days behind schedule (${forecast.confidence_label}).`
                    : 'Target convergence predicted 14 days ahead of Q4 schedule.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowModelDetails((prev) => !prev)}
                className="text-label-md text-secondary hover:underline shrink-0"
              >
                {showModelDetails ? 'Hide Parameters' : 'Model Parameters'}
              </button>
            </div>

            {showModelDetails && (
              <div className="px-4 py-3 rounded-lg bg-surface-container-low border border-border-hairline text-body-sm text-on-surface-variant flex flex-wrap items-center justify-between gap-2">
                <span>
                  {forecast
                    ? `Scikit-learn LinearRegression (slope ${forecast.slope_per_month >= 0 ? '+' : ''}${forecast.slope_per_month.toFixed(2)}%/mo, next month proj. ${forecast.projected_next_month.toFixed(1)}%)`
                    : 'Weighted Control Closure Velocity (alpha=0.42) + Inherent Residual Decay (beta=0.58)'}
                </span>
                <span className="font-mono text-label-md text-secondary font-bold">
                  R² = {forecast ? forecast.r_squared.toFixed(3) : '0.964'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Departmental Audit Health */}
        <div className="xl:col-span-5 bg-surface-container-lowest rounded-xl p-6 border border-border-hairline/80 shadow-exec-sm flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-headline-lg text-primary">Departmental Audit Health</h2>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Composite compliance scores by core division
                </p>
              </div>
              <Link
                to="/departments"
                className="text-label-lg text-secondary hover:text-secondary-container inline-flex items-center gap-1 group shrink-0"
              >
                <span>View all {dashboard?.departments.length ?? 8}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="space-y-4">
              {topDepartments.map((dept) =>
                dept.attentionArea ? (
                  <div
                    key={dept.id}
                    onClick={() => navigate('/departments')}
                    className="bg-surface-container-low/90 border border-secondary/25 p-4 rounded-xl cursor-pointer hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-headline-sm text-on-surface font-semibold">{dept.name}</span>
                        <StatusBadge tone="info">Attention Area</StatusBadge>
                      </div>
                      <span className="font-mono text-data-mono text-secondary font-bold tabular-nums">
                        {dept.score.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={dept.score} heightClass="h-2" trackClass="bg-surface-container-high" />
                    {dept.note && <p className="text-body-sm text-on-surface-variant mt-2 leading-relaxed">{dept.note}</p>}
                  </div>
                ) : (
                  <div
                    key={dept.id}
                    onClick={() => navigate('/departments')}
                    className="py-1 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-headline-sm text-on-surface font-semibold group-hover:text-secondary transition-colors">
                        {dept.name}
                      </span>
                      <span className="font-mono text-data-mono text-on-surface font-bold tabular-nums">
                        {dept.score.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={dept.score} heightClass="h-2" trackClass="bg-surface-container-high" />
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-surface-container flex items-center justify-between gap-3">
            <span className="text-body-sm text-outline">Minimum composite floor: {minFloor.toFixed(1)}%</span>
            <button
              type="button"
              onClick={() =>
                onNotify('Composite weighting: Control Score 55% • SLA Velocity 25% • Residual Risk 20% (Pandas engine).')
              }
              className="text-label-md text-secondary hover:underline inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Weighting Methodology</span>
            </button>
          </div>
        </div>
      </section>

      {/* Priority Findings Requiring Governance Sign-off */}
      <section className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden flex flex-col">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container">
          <div>
            <h2 className="text-headline-lg text-primary">Priority Findings Requiring Governance Sign-off</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Top-tier escalated items requiring executive committee review and authorization
            </p>
          </div>

          <div className="inline-flex items-center p-1 rounded-lg bg-surface-container-low border border-border-hairline/70 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPendingOnly(false)}
              className={`px-3 py-1.5 rounded-md text-label-md transition-colors ${
                !pendingOnly
                  ? 'bg-surface-container-lowest text-on-surface font-bold shadow-exec-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All Escalated ({signoffRows.length})
            </button>
            <button
              type="button"
              onClick={() => setPendingOnly(true)}
              className={`px-3 py-1.5 rounded-md text-label-md transition-colors ${
                pendingOnly
                  ? 'bg-surface-container-lowest text-secondary font-bold shadow-exec-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Pending ({signoffRows.filter((i) => !i.signedOff).length})
            </button>
          </div>
        </div>

        {visibleFindings.length === 0 ? (
          <EmptyState
            title="No pending governance sign-offs"
            description="All escalated priority findings in this view have been verified and signed off."
            actionLabel="Open Findings & Actions"
            onAction={() => navigate('/findings-and-actions')}
          />
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left min-w-[820px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Finding Reference</th>
                  <th className="py-3.5 px-5 font-semibold">Department</th>
                  <th className="py-3.5 px-5 font-semibold">Criticality</th>
                  <th className="py-3.5 px-5 font-semibold">Responsible Lead</th>
                  <th className="py-3.5 px-5 font-semibold">Target Resolution</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {visibleFindings.map((item) => {
                  const isExpanded = expandedFindingId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedFindingId(isExpanded ? null : item.id)}
                        className="hover:bg-surface-container-low/50 transition-colors group cursor-pointer"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-outline group-hover:text-secondary transition-colors">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono text-headline-sm text-secondary font-bold">
                                {item.code}
                              </span>
                              <span className="text-body-sm text-on-surface-variant truncate max-w-sm mt-0.5">
                                {item.title}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="text-body-md text-on-surface font-medium">{item.department}</span>
                        </td>
                        <td className="py-4 px-5">
                          <StatusBadge
                            tone={
                              item.severity === 'Critical'
                                ? 'danger'
                                : item.severity === 'High'
                                  ? 'secondary'
                                  : 'neutral'
                            }
                          >
                            {item.criticalityLabel}
                          </StatusBadge>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-label-sm shrink-0">
                              {item.leadInitials}
                            </div>
                            <span className="text-body-sm text-on-surface font-medium">{item.leadName}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5 font-mono text-data-mono text-on-surface tabular-nums">
                          {item.targetResolution}
                        </td>
                        <td
                          className="py-4 px-6 text-right"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {item.signedOff ? (
                            <button
                              type="button"
                              disabled={mode === 'api' || !canSignOff}
                              onClick={() => void handleSignOff(item)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-label-md rounded-lg transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Signed Off</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canSignOff || signingOffId === item.id}
                              onClick={() => void handleSignOff(item)}
                              title={canSignOff ? 'Record executive sign-off' : 'Admin / Management role required'}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-surface-container-high hover:bg-secondary hover:text-on-secondary disabled:opacity-50 disabled:cursor-not-allowed text-on-surface text-label-md rounded-lg transition-all"
                            >
                              {!canSignOff && <Lock className="w-3 h-3" />}
                              <span>{signingOffId === item.id ? 'Signing...' : 'Sign-off'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-surface-container-low/40">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-6 border-l-2 border-secondary">
                              <div className="space-y-1">
                                <span className="text-label-sm uppercase tracking-wider text-outline font-semibold">
                                  Committee Determination Summary
                                </span>
                                <p className="text-body-sm text-on-surface">{item.rootCause || item.title}</p>
                              </div>
                              <Link
                                to="/findings-and-actions"
                                className="inline-flex items-center gap-1.5 text-label-md text-secondary hover:underline shrink-0"
                              >
                                <span>Open Full Action Plan</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 bg-surface-container-low/40 border-t border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-body-sm text-outline">
            Showing prioritized {visibleFindings.length} of {openFindingsCount} open oversight determinations
          </span>
          <Link
            to="/findings-and-actions"
            className="text-label-lg text-secondary hover:text-secondary-container inline-flex items-center gap-1.5 group"
          >
            <span>Explore all findings in Findings &amp; Actions</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </div>
  );
};
