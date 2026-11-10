import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../pages/LoginPage';
import { ApiError } from '../services/apiClient';

const mockLogin = vi.fn();
const mockEnterDemoMode = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    mode: 'anonymous',
    user: null,
    login: mockLogin,
    logout: vi.fn(),
    enterDemoMode: mockEnterDemoMode,
    switchDemoRole: vi.fn(),
    hasRole: () => false,
    isDemoMode: false,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockEnterDemoMode.mockReset();
  });

  it('displays API error alert when credential verification fails', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Invalid email or password.'));

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard Route</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/password/i), 'WrongPass123!');
    await user.click(screen.getByRole('button', { name: /Sign In to Live Platform/i }));

    expect(mockLogin).toHaveBeenCalledWith('eleanor.vance@companyaudit.io', 'WrongPass123!');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
  });

  it('allows entering Offline Demo Preview for a selected role and navigates to dashboard', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard Route</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.selectOptions(screen.getByLabelText('Demo Mode Role'), 'Auditor');
    await user.click(screen.getByRole('button', { name: /Enter Demo Mode/i }));

    expect(mockEnterDemoMode).toHaveBeenCalledWith('Auditor');
    expect(await screen.findByText('Dashboard Route')).toBeInTheDocument();
  });
});

