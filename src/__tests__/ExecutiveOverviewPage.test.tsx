import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutiveOverviewPage } from '../pages/ExecutiveOverviewPage';
import { apiClient } from '../services/apiClient';
import { DashboardOverviewOut } from '../types/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    mode: 'api',
    isDemoMode: false,
    isAuthenticated: true,
    user: {
      id: 'u-admin',
      company_id: 'c-1',
      department_id: null,
      department_name: null,
      email: 'eleanor.vance@companyaudit.io',
      full_name: 'Eleanor Vance',
      initials: 'EV',
      job_title: 'CAO',
      role: 'Admin',
      certifications: ['CPA'],
      is_active: true,
      last_login_at: null,
    },
    hasRole: (...roles: string[]) => roles.includes('Admin'),
  }),
}));

vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
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

const SAMPLE_DASHBOARD: DashboardOverviewOut = {
  company_name: 'Acme Holdings Corp',
  fiscal_year: 'FY 2025 Q4',
  period: 'Q4 2025 (Current)',
  composite_score: 84.5,
  enterprise_target: 85,
  minimum_floor: 80,
  total_audits_count: 8,
  active_audits_count: 3,
  completed_audits_count: 5,
  audit_completion_rate_pct: 62.5,
  critical_high_risks_count: 2,
  board_risk_threshold: 5,
  open_findings_count: 6,
  critical_findings_count: 1,
  overdue_findings_count: 1,
  overdue_actions_count: 1,
  sla_compliance_pct: 88.0,
  performance_trend: [{ month: 'Nov 2025', actual: 84.5, target: 85, baseline: 80 }],
  forecast: {
    slope_per_month: 0,
    intercept: 84.5,
    r_squared: 0,
    current_score: 84.5,
    target_score: 85,
    projected_next_month: 84.5,
    predicted_months_to_target: null,
    predicted_days_ahead_or_behind: 0,
    confidence_label: 'Insufficient History',
    data_points_count: 1,
    is_sufficient_for_forecast: false,
    methodology_note:
      'Only 1 monthly observation recorded; minimum 3 distinct chronological months required for Scikit-learn LinearRegression.',
  },
  departments: [
    {
      id: 'dept-fin',
      code: 'FIN-01',
      name: 'Finance & Treasury',
      score: 91.2,
      head_name: 'David Sterling',
      attention_area: false,
      attention_note: null,
      open_findings_count: 1,
      active_risks_count: 2,
    } as unknown as DashboardOverviewOut['departments'][number],
    {
      id: 'dept-unscored',
      code: 'OPS-08',
      name: 'Supply Chain Logistics',
      score: null,
      head_name: 'Elena Rostova',
      attention_area: false,
      attention_note: null,
      open_findings_count: 0,
      active_risks_count: 1,
    } as unknown as DashboardOverviewOut['departments'][number],
  ],
  risk_distribution: {
    total_risks: 7,
    by_severity: { Critical: 1, High: 1, Medium: 3, Low: 2 },
    by_category: { Cyber: 3, Operational: 4 },
    by_status: { Active: 7 },
    matrix: [],
  },
  priority_signoffs: [],
  framework_compliance: [
    {
      framework: 'SOC 2 Type II',
      controls_evaluated: 12,
      controls_total: 12,
      score: 91.5,
      status: 'Compliant',
    },
  ],
  evidence_breakdown: {
    total: 15,
    verified: 14,
    pending_review: 1,
    flagged: 0,
  },
};

describe('ExecutiveOverviewPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/departments') {
        return [
          {
            id: 'dept-fin',
            company_id: 'c-1',
            code: 'FIN-01',
            name: 'Finance & Treasury',
            head_name: 'David Sterling',
            score: 91.2,
            attention_area: false,
            attention_note: null,
            target_benchmark: 85,
            open_findings_count: 1,
            active_risks_count: 2,
          },
          {
            id: 'dept-unscored',
            company_id: 'c-1',
            code: 'OPS-08',
            name: 'Supply Chain Logistics',
            head_name: 'Elena Rostova',
            score: null,
            attention_area: false,
            attention_note: null,
            target_benchmark: 85,
            open_findings_count: 0,
            active_risks_count: 1,
          },
        ];
      }
      return SAMPLE_DASHBOARD;
    });
  });

  it('renders insufficient forecast notice and Unrated label for unscored departments', async () => {
    render(
      <MemoryRouter>
        <ExecutiveOverviewPage onNotify={vi.fn()} />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Insufficient historical data for regression forecast:/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/minimum 3 distinct chronological months required/i)).toBeInTheDocument();
    expect(screen.getByText('Supply Chain Logistics')).toBeInTheDocument();
    expect(screen.getByText('Unrated')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('passes interactive filter query params to GET /dashboard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExecutiveOverviewPage onNotify={vi.fn()} />
      </MemoryRouter>
    );

    await screen.findByText('Finance & Treasury');

    await user.selectOptions(screen.getByLabelText('Filter by Department'), 'dept-fin');
    await user.selectOptions(screen.getByLabelText('Filter by Domain'), 'Technology');
    await user.selectOptions(screen.getByLabelText('Filter by Audit Status'), 'In Progress');
    await user.selectOptions(screen.getByLabelText('Filter by Risk Severity'), 'Critical');

    await waitFor(() => {
      const calls = vi.mocked(apiClient.get).mock.calls.map(([p]) => p);
      const matching = calls.find(
        (p) =>
          p.includes('department_id=dept-fin') &&
          p.includes('domain=Technology') &&
          p.includes('audit_status=In+Progress') &&
          p.includes('risk_severity=Critical')
      );
      expect(matching).toBeTruthy();
    });
  });
});
