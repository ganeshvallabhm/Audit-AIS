import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiClient,
  readCookie,
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from '../services/apiClient';
import { RoleLiteral, TokenResponse, UserSummary } from '../types/api';

export type SessionMode = 'loading' | 'api' | 'demo' | 'anonymous';

const DEMO_MODE_KEY = 'companyaudit_demo_mode';
const DEMO_ROLE_KEY = 'companyaudit_demo_role';

const DEMO_USERS_BY_ROLE: Record<RoleLiteral, UserSummary> = {
  Admin: {
    id: 'demo-admin',
    company_id: 'demo-company',
    department_id: null,
    department_name: null,
    email: 'eleanor.vance@companyaudit.io',
    full_name: 'Eleanor Vance',
    initials: 'EV',
    job_title: 'Chief Audit Officer',
    role: 'Admin',
    certifications: ['CPA', 'CIA', 'CISA', 'CRISC'],
    is_active: true,
    last_login_at: null,
  },
  Auditor: {
    id: 'demo-auditor',
    company_id: 'demo-company',
    department_id: null,
    department_name: null,
    email: 'marcus.chen@companyaudit.io',
    full_name: 'Marcus Chen',
    initials: 'MC',
    job_title: 'Principal Financial & Cloud Auditor',
    role: 'Auditor',
    certifications: ['CPA', 'CISA'],
    is_active: true,
    last_login_at: null,
  },
  'Department Head': {
    id: 'demo-dept-head',
    company_id: 'demo-company',
    department_id: 'demo-its04',
    department_name: 'Information Technology & SecOps',
    email: 'marcus.kane@companyaudit.io',
    full_name: 'Marcus Kane',
    initials: 'MK',
    job_title: 'VP SecOps',
    role: 'Department Head',
    certifications: ['CISSP', 'CISM'],
    is_active: true,
    last_login_at: null,
  },
  Management: {
    id: 'demo-management',
    company_id: 'demo-company',
    department_id: 'demo-fin01',
    department_name: 'Finance & Treasury',
    email: 'david.sterling@companyaudit.io',
    full_name: 'David Sterling',
    initials: 'DS',
    job_title: 'Corporate Treasurer & EVP Finance',
    role: 'Management',
    certifications: ['CPA', 'CFA'],
    is_active: true,
    last_login_at: null,
  },
  Viewer: {
    id: 'demo-viewer',
    company_id: 'demo-company',
    department_id: null,
    department_name: null,
    email: 'viewer@companyaudit.io',
    full_name: 'Margaret Sterling',
    initials: 'MS',
    job_title: 'Board Audit Committee Observer',
    role: 'Viewer',
    certifications: ['NACD'],
    is_active: true,
    last_login_at: null,
  },
};

interface AuthContextValue {
  mode: SessionMode;
  isDemoMode: boolean;
  isAuthenticated: boolean;
  user: UserSummary | null;
  login: (email: string, password: string) => Promise<UserSummary>;
  logout: () => Promise<void>;
  enterDemoMode: (role?: RoleLiteral) => void;
  switchDemoRole: (role: RoleLiteral) => void;
  hasRole: (...roles: RoleLiteral[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<SessionMode>('loading');
  const [user, setUser] = useState<UserSummary | null>(null);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      setUser(null);
      setMode((prev) => (prev === 'demo' ? 'demo' : 'anonymous'));
    });

    let active = true;
    const bootstrap = async () => {
      if (localStorage.getItem(DEMO_MODE_KEY) === 'true') {
        const storedRole = (localStorage.getItem(DEMO_ROLE_KEY) as RoleLiteral | null) || 'Admin';
        const validRole: RoleLiteral = storedRole in DEMO_USERS_BY_ROLE ? storedRole : 'Admin';
        if (active) {
          setUser(DEMO_USERS_BY_ROLE[validRole]);
          setMode('demo');
        }
        return;
      }

      if (!readCookie('companyaudit_csrf')) {
        if (active) {
          setUser(null);
          setMode('anonymous');
        }
        return;
      }

      const refreshed = await refreshAccessToken();
      if (!active) return;
      if (refreshed?.user) {
        setUser(refreshed.user);
        setMode('api');
      } else {
        setUser(null);
        setMode('anonymous');
      }
    };

    void bootstrap();
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<UserSummary> => {
    const data = await apiClient.post<TokenResponse>(
      '/auth/login',
      { email, password },
      { skipAuth: true }
    );
    localStorage.removeItem(DEMO_MODE_KEY);
    localStorage.removeItem(DEMO_ROLE_KEY);
    setAccessToken(data.access_token);
    setUser(data.user);
    setMode('api');
    return data.user;
  }, []);

  const enterDemoMode = useCallback((role: RoleLiteral = 'Admin') => {
    setAccessToken(null);
    localStorage.setItem(DEMO_MODE_KEY, 'true');
    localStorage.setItem(DEMO_ROLE_KEY, role);
    setUser(DEMO_USERS_BY_ROLE[role]);
    setMode('demo');
  }, []);

  const switchDemoRole = useCallback((role: RoleLiteral) => {
    localStorage.setItem(DEMO_ROLE_KEY, role);
    setUser(DEMO_USERS_BY_ROLE[role]);
  }, []);

  const logout = useCallback(async () => {
    if (mode === 'api') {
      try {
        await apiClient.post('/auth/logout', {});
      } catch {
        // Always clear client session state even if network call fails
      }
    }
    localStorage.removeItem(DEMO_MODE_KEY);
    localStorage.removeItem(DEMO_ROLE_KEY);
    setAccessToken(null);
    setUser(null);
    setMode('anonymous');
  }, [mode]);

  const hasRole = useCallback(
    (...roles: RoleLiteral[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        mode,
        isDemoMode: mode === 'demo',
        isAuthenticated: (mode === 'api' || mode === 'demo') && user !== null,
        user,
        login,
        logout,
        enterDemoMode,
        switchDemoRole,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

