import React, { useCallback, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { AiAuditAssistantPage } from './pages/AiAuditAssistantPage';
import { AuditChecklistsPage } from './pages/AuditChecklistsPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { AuditsManagementPage } from './pages/AuditsManagementPage';
import { CompanyProfilePage } from './pages/CompanyProfilePage';
import { DepartmentsPage } from './pages/DepartmentsPage';
import { EvidenceManagementPage } from './pages/EvidenceManagementPage';
import { ExecutiveOverviewPage } from './pages/ExecutiveOverviewPage';
import { FindingsCorrectiveActionsPage } from './pages/FindingsCorrectiveActionsPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportsInsightsPage } from './pages/ReportsInsightsPage';
import { RiskComplianceMatrixPage } from './pages/RiskComplianceMatrixPage';
import { SettingsPage } from './pages/SettingsPage';

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
            </AppShell>
          </ProtectedPlatform>
        }
      />
    </Routes>
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
