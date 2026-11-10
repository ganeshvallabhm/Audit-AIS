export type AuditDomain =
  | 'Financial'
  | 'HR'
  | 'Technology'
  | 'Project'
  | 'Customer'
  | 'Operations'
  | 'Compliance';

export type AuditStatus = 'In Progress' | 'Under Review' | 'Scheduled' | 'Completed';

export interface AuditEngagement {
  id: string;
  code: string;
  title: string;
  domain: AuditDomain;
  framework: string;
  businessUnit: string;
  leadAuditor: string;
  leadInitials: string;
  leadRole: string;
  targetDue: string;
  score: number | null;
  status: AuditStatus;
  controlsEvaluated: number;
  controlsTotal: number;
  summary: string;
  stages: {
    name: string;
    progress: number;
    state: 'completed' | 'active' | 'pending';
  }[];
}

export type RiskSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type RiskStatus = 'Open' | 'Under Treatment' | 'Mitigated' | 'In Review';

export interface EnterpriseRisk {
  id: string;
  title: string;
  scope: string;
  category: 'Technology' | 'Financial' | 'Compliance' | 'Operations';
  probability: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  score: number;
  severity: RiskSeverity;
  owner: {
    name: string;
    role: string;
    initials: string;
    avatarBg: string;
  };
  mitigationStrategy: string;
  status: RiskStatus;
  residualScore: number;
  residualLevel: string;
  progress: number;
  narrative: string;
  affectedAssets: string[];
  escalation: string;
  nextReview: string;
  milestones: {
    id: string;
    title: string;
    subtitle: string;
    completed: boolean;
    inProgress?: boolean;
  }[];
  frameworks: {
    code: string;
    name: string;
    description: string;
  }[];
  auditLog: {
    title: string;
    timestamp: string;
    detail: string;
    tone: 'secondary' | 'error' | 'neutral';
  }[];
}

export type FindingSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FindingStatus = 'Open' | 'In Progress' | 'Verification Pending' | 'Overdue' | 'Closed';

export interface FindingMilestone {
  id: string;
  step: number;
  title: string;
  detail: string;
  status: 'completed' | 'active' | 'pending';
}

export interface EvidenceArtifact {
  id: string;
  filename: string;
  size: string;
  tag: string;
  auditCode: string;
  department: string;
  uploadedBy: string;
  uploadedAt: string;
  sha256: string;
  status: 'Verified' | 'Pending Review' | 'Flagged';
}

export interface AuditFinding {
  id: string;
  title: string;
  shortTitle: string;
  rootCauseShort: string;
  rootCauseDetailed: string;
  department: string;
  workstream: string;
  severity: FindingSeverity;
  tierLabel: string;
  owner: {
    name: string;
    initials: string;
    avatarBg: string;
  };
  leadAuditor: string;
  targetSla: string;
  slaCountdown: string;
  isOverdue?: boolean;
  progress: number;
  progressLabel: 'Active' | 'Stalled' | 'Review' | 'Completed';
  status: FindingStatus;
  actionType: 'Update' | 'Verify';
  evidence: {
    filename: string;
    meta: string;
    icon: 'terminal' | 'policy';
  }[];
  milestones: FindingMilestone[];
}

export interface PrioritySignoffFinding {
  id: string;
  title: string;
  department: string;
  criticality: 'Tier 1 Critical' | 'High Risk' | 'Medium Risk';
  leadInitials: string;
  leadName: string;
  targetResolution: string;
  signedOff?: boolean;
}

export interface DepartmentHealth {
  id: string;
  name: string;
  code: string;
  head: string;
  score: number;
  target: number;
  activeAudits: number;
  openFindings: number;
  attentionArea?: boolean;
  note?: string;
}

export interface ReportSuite {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  onDemand?: boolean;
  tags: string[];
  formatTag: string;
  icon: 'building' | 'shield' | 'grid' | 'alarm' | 'domain' | 'brain';
  primaryAction: 'Download PDF' | 'Generate Report';
  secondaryAction: 'Customize' | 'Configure Feeds';
}

export interface DistributionRule {
  id: string;
  title: string;
  scheduleSummary: string;
  nextRun: string;
  status: 'Active' | 'Paused';
  icon: 'mail' | 'hub' | 'cloud';
}

export interface ChecklistItem {
  id: string;
  controlId: string;
  framework: string;
  domain: AuditDomain;
  title: string;
  procedure: string;
  owner: string;
  status: 'Passed' | 'In Testing' | 'Exception' | 'Not Started';
  evidenceCount: number;
  lastTested: string;
}

export interface AuditHistoryEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  entityRef: string;
  module: string;
  hash: string;
  category: 'Sign-Off' | 'Control Test' | 'Risk Escalation' | 'Evidence' | 'System';
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  severity: 'critical' | 'warning' | 'info';
  unread: boolean;
  link: string;
}

