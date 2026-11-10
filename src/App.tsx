import React, { Suspense, lazy, useCallback, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

const AiAuditAssistantPage = lazy(() =>
  import('./pages/AiAuditAssistantPage').then((m) => ({ default: m.AiAuditAssistantPage }))
);
const AuditChecklistsPage = lazy(() =>
  import('./pages/AuditChecklistsPage').then((m) => ({ default: m.AuditChecklistsPage }))
);
const AuditHistoryPage = lazy(() =>
  import('./pages/AuditHistoryPage').then((m) => ({ default: m.AuditHistoryPage }))
);
const AuditsManagementPage = lazy(() =>
  import('./pages/AuditsManagementPage').then((m) => ({ default: m.AuditsManagementPage }))
);
const CompanyProfilePage = lazy(() =>
  import('./pages/CompanyProfilePage').then((m) => ({ default: m.CompanyProfilePage }))
);
const DepartmentsPage = lazy(() =>
  import('./pages/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage }))
);
const EvidenceManagementPage = lazy(() =>
  import('./pages/EvidenceManagementPage').then((m) => ({ default: m.EvidenceManagementPage }))
);
const ExecutiveOverviewPage = lazy(() =>
  import('./pages/ExecutiveOverviewPage').then((m) => ({ default: m.ExecutiveOverviewPage }))
);
const FindingsCorrectiveActionsPage = lazy(() =>
  import('./pages/FindingsCorrectiveActionsPage').then((m) => ({
    default: m.FindingsCorrectiveActionsPage,
  }))
);
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const ReportsInsightsPage = lazy(() =>
  import('./pages/ReportsInsightsPage').then((m) => ({ default: m.ReportsInsightsPage }))
);
const RiskComplianceMatrixPage = lazy(() =>
  import('./pages/RiskComplianceMatrixPage').then((m) => ({ default: m.RiskComplianceMatrixPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

const PageLoadingSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-label="Loading module">
    <div className="h-24 rounded-2xl bg-surface-container-low border border-border-hairline" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="h-32 rounded-xl bg-surface-container-low border border-border-hairline" />
      <div className="h-32 rounded-xl bg-surface-container-low border border-border-hairline" />
      <div className="h-32 rounded-xl bg-surface-container-low border border-border-hairline" />
    </div>
    <div className="h-72 rounded-2xl bg-surface-container-low border border-border-hairline" />
  </div>
);

const ProtectedPlatform: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, isAuthenticated } = useAuth();
  const location = useLocation();

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin mx-auto" />
          <p className="text-body-sm text-on-surface-variant font-medium">
            Verifying enterprise audit session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleNotify = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const handleClearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface flex items-center justify-center p-6">
          <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedPlatform>
              <AppShell
                toastMessage={toastMessage}
                onClearToast={handleClearToast}
                onNotify={handleNotify}
              >
                <Suspense fallback={<PageLoadingSkeleton />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route
                      path="/dashboard"
                      element={<ExecutiveOverviewPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/company-profile"
                      element={<CompanyProfilePage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/departments"
                      element={<DepartmentsPage onNotify={handleNotify} />}
                    />

                    {/* Audit Management + 6 Domain Modules + Checklists, Evidence, History */}
                    <Route
                      path="/audits"
                      element={<AuditsManagementPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/audits/financial"
                      element={
                        <AuditsManagementPage domainFilter="Financial" onNotify={handleNotify} />
                      }
                    />
                    <Route
                      path="/audits/hr"
                      element={<AuditsManagementPage domainFilter="HR" onNotify={handleNotify} />}
                    />
                    <Route
                      path="/audits/technology"
                      element={
                        <AuditsManagementPage domainFilter="Technology" onNotify={handleNotify} />
                      }
                    />
                    <Route
                      path="/audits/project"
                      element={
                        <AuditsManagementPage domainFilter="Project" onNotify={handleNotify} />
                      }
                    />
                    <Route
                      path="/audits/customer"
                      element={
                        <AuditsManagementPage domainFilter="Customer" onNotify={handleNotify} />
                      }
                    />
                    <Route
                      path="/audits/operations"
                      element={
                        <AuditsManagementPage domainFilter="Operations" onNotify={handleNotify} />
                      }
                    />
                    <Route
                      path="/audits/checklists"
                      element={<AuditChecklistsPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/audits/evidence"
                      element={<EvidenceManagementPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/audits/history"
                      element={<AuditHistoryPage onNotify={handleNotify} />}
                    />

                    {/* Risk, Findings, AI Assistant, Reports, Notifications, Settings */}
                    <Route
                      path="/risk-and-compliance"
                      element={<RiskComplianceMatrixPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/findings-and-actions"
                      element={<FindingsCorrectiveActionsPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/ai-assistant"
                      element={<AiAuditAssistantPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/reports"
                      element={<ReportsInsightsPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/notifications"
                      element={<NotificationsPage onNotify={handleNotify} />}
                    />
                    <Route
                      path="/settings"
                      element={<SettingsPage onNotify={handleNotify} />}
                    />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </ProtectedPlatform>
          }
        />
      </Routes>
    </Suspense>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
