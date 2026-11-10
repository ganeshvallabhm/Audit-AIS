import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingsCorrectiveActionsPage } from '../pages/FindingsCorrectiveActionsPage';
import { apiClient } from '../services/apiClient';
import { FindingOut } from '../types/api';

let currentRole: 'Admin' | 'Viewer' = 'Admin';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    mode: 'api',
    isDemoMode: false,
    isAuthenticated: true,
    user: {
      id: currentRole === 'Admin' ? 'u-admin' : 'u-viewer',
      company_id: 'c-1',
      department_id: null,
      department_name: null,
      email: currentRole === 'Admin' ? 'eleanor.vance@companyaudit.io' : 'viewer@companyaudit.io',
      full_name: currentRole === 'Admin' ? 'Eleanor Vance' : 'Margaret Sterling',
      initials: currentRole === 'Admin' ? 'EV' : 'MS',
      job_title: currentRole === 'Admin' ? 'CAO' : 'Board Observer',
      role: currentRole,
      certifications: [],
      is_active: true,
      last_login_at: null,
    },
    hasRole: (...roles: string[]) => roles.includes(currentRole),
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

const SAMPLE_FINDING: FindingOut = {
  id: 'fnd-1024',
  company_id: 'c-1',
  code: 'FND-1024',
  audit_id: 'aud-1',
  audit_code: 'AUD-2025-094',
  audit_title: 'Enterprise Cloud SecOps Assurance',
  audit_response_id: null,
  department_id: 'dept-it',
  department_name: 'Information Technology & SecOps',
  department_code: 'ITS-04',
  owner_user_id: 'u-head',
  owner_name: 'Marcus Kane',
  owner_initials: 'MK',
  lead_auditor_id: 'u-aud',
  lead_auditor_name: 'Marcus Chen',
  signed_off_by_id: null,
  title: 'IAM Key Rotation Cutover Verification Pending',
  root_cause: 'Legacy KMS keys remained active beyond 90-day rotation window.',
  workstream: 'Cloud IAM Assurance',
  severity: 'Critical',
  status: 'Verification Pending',
  target_sla_date: '2026-01-31',
  sla_countdown: 'Pending Sign-off',
  is_overdue: false,
  progress_percent: 100,
  management_response: 'Automation deployed; ready for CAO verification.',
  rejection_reason: null,
  signed_off_by_name: null,
  signed_off_at: null,
  corrective_actions: [
    {
      id: 'ca-1',
      company_id: 'c-1',
      finding_id: 'fnd-1024',
      finding_code: 'FND-1024',
      finding_title: 'IAM Key Rotation Cutover Verification Pending',
      recommendation_id: null,
      risk_id: null,
      risk_code: null,
      verified_by_user_id: null,
      verified_by_name: null,
      code: 'ACT-01',
      step_order: 1,
      title: 'Rotate root IAM access keys',
      detail: 'Decommission legacy access tokens',
      status: 'Submitted',
      progress_percent: 100,
      due_date: '2026-01-20',
      assigned_to_user_id: 'u-head',
      assigned_to_name: 'Marcus Kane',
      completed_at: null,
      verified_at: null,
      created_at: '2025-11-01T00:00:00Z',
      updated_at: '2025-11-05T00:00:00Z',
    },
  ],
  recommendations: [],
  evidence_items: [],
  created_at: '2025-11-01T00:00:00Z',
  updated_at: '2025-11-10T00:00:00Z',
};

describe('FindingsCorrectiveActionsPage', () => {
  beforeEach(() => {
    currentRole = 'Admin';
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path.startsWith('/findings')) {
        return { items: [SAMPLE_FINDING], total: 1, limit: 200, offset: 0 };
      }
      if (path.startsWith('/audits')) {
        return { items: [], total: 0, limit: 100, offset: 0 };
      }
      if (path === '/departments') return [];
      if (path === '/auth/users') return [];
      return {};
    });
    vi.mocked(apiClient.put).mockResolvedValue({ ...SAMPLE_FINDING, status: 'In Progress' });
  });

  it('rejects a Verification Pending finding with rejection_reason payload', async () => {
    const user = userEvent.setup({ delay: null });
    const onNotify = vi.fn();

    render(
      <MemoryRouter>
        <FindingsCorrectiveActionsPage onNotify={onNotify} />
      </MemoryRouter>
    );

    const inspectBtn = await screen.findByRole('button', { name: /Inspect FND-1024/i });
    await user.click(inspectBtn);

    const rejectTrigger = await screen.findByRole('button', { name: /Reject Verification & Reopen/i });
    await user.click(rejectTrigger);

    const submitReject = screen.getByRole('button', { name: /Reject & Reopen Finding/i });
    expect(submitReject).toBeDisabled();

    const textarea = screen.getByLabelText(/Rejection Reason/i);
    await user.type(textarea, 'Evidence log predates KMS key cutover window.');
    expect(submitReject).toBeEnabled();

    await user.click(submitReject);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/findings/fnd-1024', {
        status: 'In Progress',
        rejection_reason: 'Evidence log predates KMS key cutover window.',
      });
    });
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('Rejected verification'));
  }, 15000);

  it('enforces read-only controls for Viewer role', async () => {
    currentRole = 'Viewer';
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FindingsCorrectiveActionsPage onNotify={vi.fn()} />
      </MemoryRouter>
    );

    const logBtn = await screen.findByRole('button', { name: /Log Audit Finding/i });
    expect(logBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Inspect FND-1024/i }));
    expect(screen.queryByRole('button', { name: /Reject Verification & Reopen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete Non-Closed Finding/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Management Note/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Requires Admin \/ Management Sign-off/i })).toBeDisabled();
  });
});
