import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ToastBanner } from '../ui/ToastBanner';
import { CommandSearchModal } from './CommandSearchModal';
import { EnterpriseFooter } from './EnterpriseFooter';
import { TopNavHeader } from './TopNavHeader';

interface AppShellProps {
  children: React.ReactNode;
  toastMessage: string | null;
  onClearToast: () => void;
  onNotify: (msg: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  toastMessage,
  onClearToast,
  onNotify,
}) => {
  const { isDemoMode, user, logout } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();

  const handleSwitchToLive = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      <TopNavHeader
        onOpenCommandSearch={() => setCommandOpen(true)}
        onNotify={onNotify}
      />

      <main className="w-full pt-16 bg-surface flex-1">
        {isDemoMode && (
          <div className="bg-surface-container border-b border-border-hairline px-4 sm:px-6 lg:px-8 py-2">
            <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2 text-label-sm">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Eye className="w-4 h-4 text-secondary shrink-0" />
                <span>
                  Offline Demo Mode ({user?.role}) — Viewing sample fixture data; changes are not saved to PostgreSQL.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleSwitchToLive()}
                className="inline-flex items-center gap-1.5 text-secondary font-bold hover:underline"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In to Live Database</span>
              </button>
            </div>
          </div>
        )}
        <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>

      <EnterpriseFooter />

      <CommandSearchModal open={commandOpen} onClose={() => setCommandOpen(false)} />
      <ToastBanner message={toastMessage} onClose={onClearToast} />
    </div>
  );
};
