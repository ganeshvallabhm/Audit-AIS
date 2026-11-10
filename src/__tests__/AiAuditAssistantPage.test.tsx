import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAuditAssistantPage } from '../pages/AiAuditAssistantPage';
import { apiClient } from '../services/apiClient';
import { AiSynthesisResponse, DashboardOverviewOut } from '../types/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    mode: 'api',
    isDemoMode: false,
    isAuthenticated: true,
    user: {
      id: 'u-dept-head',
      company_id: 'c-1',
      department_id: 'dept-its04',
      department_name: 'Information Technology & SecOps',
      email: 'marcus.kane@companyaudit.io',
      full_name: 'Marcus Kane',
      initials: 'MK',
      job_title: 'VP SecOps',
      role: 'Department Head',
      certifications: ['CISSP'],
      is_active: true,
      last_login_at: null,
    },
    hasRole: (...roles: string[]) => roles.includes('Department Head'),
  }),
}));

vi.mock('../services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../services/apiClient')>('../services/apiClient');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      uploadForm: vi.fn(),
      downloadBlob: vi.fn(),
    },
  };
});

const SAMPLE_DASH: DashboardOverviewOut = {
  company_name: 'Acme Holdings Corp',
  fiscal_year: 'FY 2025 Q4',
  period: 'Q4 2025 (Current)',
  composite_score: 79.4,
  enterprise_target: 85,
  minimum_floor: 80,
  total_audits_count: 3,
  active_audits_count: 2,
  completed_audits_count: 1,
  audit_completion_rate_pct: 33.3,
  critical_high_risks_count: 2,
  board_risk_threshold: 5,
  open_findings_count: 4,
  critical_findings_count: 1,
  overdue_findings_count: 1,
  overdue_actions_count: 0,
  sla_compliance_pct: 82.0,
  performance_trend: [{ month: 'Oct 2025', actual: 78, target: 85, baseline: 80 }],
  forecast: {
    slope_per_month: 1.2,
    intercept: 76.8,
    r_squared: 0.91,
    current_score: 79.4,
    target_score: 85,
    projected_next_month: 80.6,
    predicted_months_to_target: null,
    predicted_days_ahead_or_behind: -5,
    confidence_label: 'Insufficient History',
    is_sufficient_for_forecast: false,
  },
  departments: [],
  risk_distribution: {
    total_risks: 3,
    by_severity: { Critical: 1, High: 1, Medium: 1, Low: 0 },
    by_category: { Cyber: 3 },
    by_status: { Active: 3 },
    matrix: [],
  },
  priority_signoffs: [],
};

const SYNTHESIS_REPLY: AiSynthesisResponse = {
  answer: 'Scoped analysis for Information Technology & SecOps.',
  verified_facts: ['FND-1024 remains Open within ITS-04 with 1 pending milestone.'],
  recommendations: ['Complete IAM KMS rotation log upload prior to Jan 31 SLA.'],
  provider_status: 'unavailable',
  provider_name: 'Deterministic PostgreSQL Telemetry Engine',
  provider_message: 'External LLM provider disabled; output derived deterministically from PostgreSQL rows.',
  scoped_department: 'Information Technology & SecOps',
  citations: [
    { entity_type: 'Finding', entity_ref: 'FND-1024', label: 'IAM Rotation Exception', route: '/findings-and-actions' },
  ],
  metrics_snapshot: { composite_score: 79.4, open_findings: 4, critical_high_risks: 2, forecast_next_month: 80.6 },
  generated_at: '2026-11-10T10:00:00Z',
};

describe('AiAuditAssistantPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/dashboard') return SAMPLE_DASH;
      if (path.startsWith('/findings')) return { items: [], total: 0, limit: 3, offset: 0 };
      if (path.startsWith('/risks')) return { items: [], total: 0, limit: 3, offset: 0 };
      return {};
    });
    vi.mocked(apiClient.post).mockResolvedValue(SYNTHESIS_REPLY);
  });

  it('shows provider honesty banner, Department Head scoping, and separated facts vs recommendations', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiAuditAssistantPage onNotify={vi.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Department Scope: Information Technology & SecOps/i)).toBeInTheDocument();
    expect(screen.getByText(/No External LLM Configured/i)).toBeInTheDocument();
    expect(screen.getByText(/RBAC Filter: Information Technology & SecOps/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask about audit findings/i);
    await user.type(input, 'Analyze SecOps findings');
    await user.click(screen.getByRole('button', { name: /^Analyze$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/reports/ai-synthesis', {
        prompt: 'Analyze SecOps findings',
        domain: null,
      });
    });

    expect(await screen.findByText('Scoped analysis for Information Technology & SecOps.')).toBeInTheDocument();
    expect(screen.getByText(/FND-1024 remains Open within ITS-04/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete IAM KMS rotation log upload/i)).toBeInTheDocument();
    expect(screen.getAllByText('Verified Database Facts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Prioritized Governance Recommendations').length).toBeGreaterThanOrEqual(1);
  });
});
