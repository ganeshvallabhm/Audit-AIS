import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import { RoleLiteral } from '../types/api';

const SEEDED_ROLE_DIRECTORY: { role: RoleLiteral; label: string; email: string; scopeNote: string }[] = [
  {
    role: 'Admin',
    label: 'Admin (CAO)',
    email: 'eleanor.vance@companyaudit.io',
    scopeNote: 'Full org admin, users, settings, audits & sign-off',
  },
  {
    role: 'Auditor',
    label: 'Auditor',
    email: 'marcus.chen@companyaudit.io',
    scopeNote: 'Audits, checklist tests, findings, risks & evidence verification',
  },
  {
    role: 'Department Head',
    label: 'Dept Head (IT)',
    email: 'marcus.kane@companyaudit.io',
    scopeNote: 'Scoped to ITS-04 findings, corrective actions & evidence upload',
  },
  {
    role: 'Management',
    label: 'Management',
    email: 'david.sterling@companyaudit.io',
    scopeNote: 'Analytics, executive sign-offs & recommendation approvals',
  },
  {
    role: 'Viewer',
    label: 'Viewer (Board)',
    email: 'viewer@companyaudit.io',
    scopeNote: 'Strictly read-only assurance & analytics access',
  },
];

export const LoginPage: React.FC = () => {
  const { isAuthenticated, mode, login, enterDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [email, setEmail] = useState('eleanor.vance@companyaudit.io');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [demoRole, setDemoRole] = useState<RoleLiteral>('Admin');

  useEffect(() => {
    if (mode !== 'loading' && isAuthenticated) {
      navigate(fromPath, { replace: true });
    }
  }, [isAuthenticated, mode, navigate, fromPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your corporate email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(fromPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.detail);
      } else {
        setErrorMsg(
          'Unable to reach the CompanyAudit API server. Verify the backend is running or enter Demo Mode below.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterDemo = () => {
    enterDemoMode(demoRole);
    navigate(fromPath, { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center px-4 py-10 text-on-surface">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-surface-container-lowest rounded-2xl border border-border-hairline shadow-exec-lg overflow-hidden">
        {/* Left Sovereign Navy Governance Panel */}
        <div className="lg:col-span-5 bg-primary-container text-white p-8 lg:p-10 flex flex-col justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-secondary-fixed" />
              </div>
              <div>
                <div className="text-headline-lg font-bold tracking-tight leading-none">CompanyAudit</div>
                <div className="text-[11px] uppercase tracking-widest text-secondary-fixed/80 mt-1">
                  Enterprise Audit &amp; Analytics
                </div>
              </div>
            </div>

            <h1 className="text-display-sm font-bold leading-tight mb-3">
              Fiduciary Oversight &amp; Control Assurance
            </h1>
            <p className="text-body-sm text-white/75 leading-relaxed">
              Sign in with your organization credentials to access PostgreSQL-backed audit engagements, weighted control
              testing, SHA-256 verified evidence, and Scikit-learn predictive trajectories.
            </p>
          </div>

          <div className="space-y-3 pt-6 border-t border-white/10">
            <div className="text-label-sm uppercase tracking-wider text-secondary-fixed/90 font-semibold">
              Click a Role to Pre-Fill Email
            </div>
            <div className="space-y-2">
              {SEEDED_ROLE_DIRECTORY.map((entry) => {
                const selected = email.toLowerCase() === entry.email.toLowerCase();
                return (
                  <button
                    key={entry.role}
                    type="button"
                    onClick={() => setEmail(entry.email)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selected
                        ? 'bg-white/15 border-secondary-fixed/60 text-white'
                        : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-md font-bold">{entry.label}</span>
                      <span className="font-mono text-[11px] text-secondary-fixed">{entry.email}</span>
                    </div>
                    <p className="text-[11px] text-white/65 mt-0.5 leading-snug">{entry.scopeNote}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed pt-1">
              Local development account passwords are provisioned in{' '}
              <code className="font-mono text-secondary-fixed">backend/.env</code> (<code className="font-mono">DEMO_ACCOUNT_PASSWORD</code>).
            </p>
          </div>
        </div>

        {/* Right Authentication Form + Offline Demo Card */}
        <div className="lg:col-span-7 p-8 lg:p-10 flex flex-col justify-between gap-8">
          <div>
            <div className="mb-6">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary-fixed text-secondary text-label-sm font-bold uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5" />
                JWT + Argon2id RBAC Session
              </span>
              <h2 className="text-headline-lg font-bold text-primary mt-3">Sign in to Workspace</h2>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Authenticate against the live FastAPI + PostgreSQL multi-tenant governance engine.
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-lg bg-error-container text-on-error-container border border-error/25 flex items-start gap-2.5 text-body-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-error" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-label-md font-semibold text-on-surface mb-1.5">
                  Corporate Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@companyaudit.io"
                  className="w-full h-11 px-3.5 rounded-lg bg-surface-container-low/70 border border-border-hairline text-body-md text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-label-md font-semibold text-on-surface mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-outline absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter workspace password"
                    className="w-full h-11 pl-10 pr-3.5 rounded-lg bg-surface-container-low/70 border border-border-hairline text-body-md text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-secondary text-on-secondary text-label-lg font-bold hover:bg-secondary-container disabled:opacity-60 transition-colors shadow-exec-sm"
              >
                <span>{submitting ? 'Verifying Credentials...' : 'Sign In to Live Platform'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Explicit Offline Demo Mode Divider */}
          <div className="pt-6 border-t border-border-hairline">
            <div className="rounded-xl bg-surface-container-low/80 border border-border-hairline p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  <span className="text-headline-sm font-bold text-primary">Offline Demo Preview</span>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Explore the UI with local fixture data (no backend writes or persistence).
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label="Demo Mode Role"
                  value={demoRole}
                  onChange={(e) => setDemoRole(e.target.value as RoleLiteral)}
                  className="h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-md text-on-surface focus:outline-none focus:border-secondary"
                >
                  <option value="Admin">Admin</option>
                  <option value="Auditor">Auditor</option>
                  <option value="Department Head">Department Head</option>
                  <option value="Management">Management</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={handleEnterDemo}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-md font-bold text-secondary hover:bg-secondary-fixed transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span>Enter Demo Mode</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

