import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardCheck, FileArchive, FolderKanban, History } from 'lucide-react';

const WORKSPACE_TABS = [
  { label: 'Engagements', to: '/audits', icon: FolderKanban },
  { label: 'Audit Checklists', to: '/audits/checklists', icon: ClipboardCheck },
  { label: 'Evidence Vault', to: '/audits/evidence', icon: FileArchive },
  { label: 'Audit History', to: '/audits/history', icon: History },
];

export const AuditWorkspaceNav: React.FC = () => {
  const { pathname } = useLocation();

  const isEngagementRoute =
    pathname === '/audits' ||
    ['/audits/financial', '/audits/hr', '/audits/technology', '/audits/project', '/audits/customer', '/audits/operations'].includes(
      pathname
    );

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <div className="inline-flex items-center p-1 rounded-xl bg-surface-container-low border border-border-hairline/80 gap-1">
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.to === '/audits' ? isEngagementRoute : pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-label-lg whitespace-nowrap transition-all ${
                active
                  ? 'bg-surface-container-lowest text-primary font-bold shadow-exec-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60 font-medium'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-secondary' : 'text-outline'}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

