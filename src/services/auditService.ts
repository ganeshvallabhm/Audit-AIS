import {
  AUDIT_ENGAGEMENTS,
  AUDIT_FINDINGS,
  AUDIT_HISTORY_LOG,
  CHECKLIST_ITEMS,
  COMPANY_PROFILE,
  DEPARTMENT_HEALTH_LIST,
  DISTRIBUTION_RULES,
  ENTERPRISE_RISKS,
  EVIDENCE_ARTIFACTS,
  INITIAL_NOTIFICATIONS,
  PERFORMANCE_TREND_DATA,
  PRIORITY_SIGNOFF_FINDINGS,
  REPORT_SUITES,
} from '../data/mockPlatformData';
import {
  AuditDomain,
  AuditEngagement,
  AuditFinding,
  EnterpriseRisk,
  FindingSeverity,
  FindingStatus,
  RiskSeverity,
  RiskStatus,
} from '../types/audit';

export const auditService = {
  getCompanyProfile: () => COMPANY_PROFILE,
  getPerformanceTrend: (period: string) => {
    if (period.includes('Q3')) {
      return PERFORMANCE_TREND_DATA.map((pt, i) => ({
        ...pt,
        actual: Number((pt.actual - (4.5 - i * 0.3)).toFixed(1)),
      }));
    }
    if (period.includes('Q2')) {
      return PERFORMANCE_TREND_DATA.map((pt, i) => ({
        ...pt,
        actual: Number((pt.actual - (7.2 - i * 0.4)).toFixed(1)),
      }));
    }
    return PERFORMANCE_TREND_DATA;
  },
  getDepartmentHealth: () => DEPARTMENT_HEALTH_LIST,
  getPrioritySignoffs: () => PRIORITY_SIGNOFF_FINDINGS,
  getEngagements: () => AUDIT_ENGAGEMENTS,
  getEngagementsByDomain: (domain?: AuditDomain): AuditEngagement[] => {
    if (!domain) return AUDIT_ENGAGEMENTS;
    return AUDIT_ENGAGEMENTS.filter((item) => item.domain === domain);
  },
  getRisks: () => ENTERPRISE_RISKS,
  filterRisks: (
    risks: EnterpriseRisk[],
    filters: {
      search: string;
      category: string;
      severity: RiskSeverity | 'All';
      status: RiskStatus | 'All';
      exactCell?: { probability: number; impact: number } | null;
    }
  ): EnterpriseRisk[] => {
    const query = filters.search.trim().toLowerCase();
    return risks.filter((risk) => {
      const matchesQuery =
        !query ||
        risk.id.toLowerCase().includes(query) ||
        risk.title.toLowerCase().includes(query) ||
        risk.scope.toLowerCase().includes(query) ||
        risk.owner.name.toLowerCase().includes(query) ||
        risk.mitigationStrategy.toLowerCase().includes(query);

      const matchesCategory = filters.category === 'All' || risk.category === filters.category;
      const matchesSeverity = filters.severity === 'All' || risk.severity === filters.severity;
      const matchesStatus = filters.status === 'All' || risk.status === filters.status;
      const matchesCell =
        !filters.exactCell ||
        (risk.probability === filters.exactCell.probability && risk.impact === filters.exactCell.impact);

      return matchesQuery && matchesCategory && matchesSeverity && matchesStatus && matchesCell;
    });
  },
  getFindings: () => AUDIT_FINDINGS,
  filterFindings: (
    findings: AuditFinding[],
    filters: {
      tab: 'all' | 'action-plan' | 'verification' | 'closed';
      search: string;
      department: string;
      severity: FindingSeverity | 'All';
      status: FindingStatus | 'All';
      slaAtRiskOnly: boolean;
      myActionsOnly: boolean;
    }
  ): AuditFinding[] => {
    const query = filters.search.trim().toLowerCase();
    return findings.filter((item) => {
      if (filters.tab === 'verification' && item.status !== 'Verification Pending') return false;
      if (filters.tab === 'closed' && item.status !== 'Closed') return false;
      if (filters.tab === 'action-plan' && item.status === 'Closed') return false;

      if (filters.slaAtRiskOnly && !item.isOverdue && item.progress > 70) return false;
      if (filters.myActionsOnly && !item.leadAuditor.includes('Eleanor Vance')) return false;

      const matchesQuery =
        !query ||
        item.id.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.rootCauseShort.toLowerCase().includes(query) ||
        item.owner.name.toLowerCase().includes(query);

      const matchesDept = filters.department === 'All Departments' || item.department === filters.department;
      const matchesSeverity = filters.severity === 'All' || item.severity === filters.severity;
      const matchesStatus = filters.status === 'All' || item.status === filters.status;

      return matchesQuery && matchesDept && matchesSeverity && matchesStatus;
    });
  },
  getReportSuites: () => REPORT_SUITES,
  getDistributionRules: () => DISTRIBUTION_RULES,
  getChecklists: (domain?: AuditDomain) =>
    domain ? CHECKLIST_ITEMS.filter((c) => c.domain === domain) : CHECKLIST_ITEMS,
  getEvidenceArtifacts: () => EVIDENCE_ARTIFACTS,
  getHistoryLog: () => AUDIT_HISTORY_LOG,
  getInitialNotifications: () => INITIAL_NOTIFICATIONS,
  exportCsvRows: (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escapeCell = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

