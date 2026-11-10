import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCheck,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { ApiError, apiClient } from '../services/apiClient';
import { SlaSweepResultOut } from '../types/api';

interface NotificationsPageProps {
  onNotify: (msg: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNotify }) => {
  const { mode, hasRole } = useAuth();
  const { notifications, unreadCount, loading, markRead, markAllRead, refresh } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical' | 'warning' | 'info'>('all');
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState<SlaSweepResultOut | null>(null);

  const canRunSlaSweep = mode === 'api' && hasRole('Admin', 'Auditor');

  const filtered = notifications.filter((item) => {
    if (filter === 'unread') return item.unread;
    if (filter === 'critical' || filter === 'warning' || filter === 'info') {
      return item.severity === filter;
    }
    return true;
  });

  const handleMarkAllRead = async () => {
    await markAllRead();
    onNotify('All governance notifications marked as read.');
  };

  const handleRunSlaSweep = async () => {
    if (!canRunSlaSweep) return;
    setSweeping(true);
    try {
      const res = await apiClient.post<SlaSweepResultOut>('/notifications/run-sla-sweep');
      setLastSweep(res);
      await refresh();
      onNotify(
        `SLA sweep complete: ${res.notifications_created} new alerts (${res.overdue_audits} overdue audits, ${res.overdue_actions} overdue actions).`
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'SLA sweep execution failed.');
    } finally {
      setSweeping(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Governance Alert Center', to: '/dashboard' },
          { label: 'Notifications & SLA Escalations' },
        ]}
        badge={
          <StatusBadge tone="info">
            <span className="font-mono">{unreadCount} Unread</span>
          </StatusBadge>
        }
        title="Notifications & SLA Escalations"
        description="Real-time audit sign-off requests, SLA breach warnings, and automated control monitoring alerts."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {canRunSlaSweep && (
              <button
                type="button"
                disabled={sweeping}
                onClick={() => void handleRunSlaSweep()}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-on-surface text-label-lg hover:bg-surface-container-low disabled:opacity-50 transition-colors shadow-exec-sm"
              >
                <RefreshCw className={`w-4 h-4 text-secondary ${sweeping ? 'animate-spin' : ''}`} />
                <span>{sweeping ? 'Scanning SLAs...' : 'Run SLA Sweep'}</span>
              </button>
            )}
            <button
              type="button"
              disabled={unreadCount === 0}
              onClick={() => void handleMarkAllRead()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-50 transition-colors shadow-exec-sm"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark All Read</span>
            </button>
          </div>
        }
      />

      {lastSweep && (
        <div className="p-4 rounded-xl bg-surface-container-low border border-border-hairline flex flex-wrap items-center justify-between gap-3 text-body-sm text-on-surface-variant">
          <span>
            <strong className="text-primary">Latest SLA Scan Telemetry:</strong>{' '}
            {lastSweep.notifications_created} alert(s) generated across {lastSweep.overdue_audits} overdue audits,{' '}
            {lastSweep.overdue_actions} overdue actions, {lastSweep.upcoming_deadlines} approaching deadlines, and{' '}
            {lastSweep.critical_risks} critical risks.
          </span>
          <span className="font-mono text-label-sm text-outline">
            {new Date(lastSweep.ran_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'all', label: `All Alerts (${notifications.length})` },
            { key: 'unread', label: `Unread (${unreadCount})` },
            { key: 'critical', label: 'Critical' },
            { key: 'warning', label: 'Warning' },
            { key: 'info', label: 'Informational' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-label-md transition-colors ${
              filter === tab.key
                ? 'bg-secondary text-on-secondary font-bold shadow-exec-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-border-hairline hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification Feed */}
      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm divide-y divide-surface-container overflow-hidden">
        {loading && notifications.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading governance alert feed...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matching notifications"
            description="No governance alerts match your active severity or unread filter."
            actionLabel="Show All Alerts"
            onAction={() => setFilter('all')}
          />
        ) : (
          filtered.map((item) => {
            const Icon =
              item.severity === 'critical'
                ? ShieldAlert
                : item.severity === 'warning'
                  ? AlertTriangle
                  : Info;
            const iconBadgeClass =
              item.severity === 'critical'
                ? 'bg-error-container text-error'
                : item.severity === 'warning'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-secondary-fixed text-secondary';

            return (
              <div
                key={item.id}
                className={`p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  item.unread ? 'bg-surface-container-low/50' : 'bg-surface-container-lowest'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${iconBadgeClass}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-headline-sm font-bold text-on-surface">{item.title}</span>
                      {item.unread && <StatusBadge tone="primary">New</StatusBadge>}
                      <span className="text-label-sm font-mono text-outline">{item.timeLabel}</span>
                    </div>
                    <p className="text-body-sm text-on-surface-variant mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {item.unread && (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      className="h-9 px-3.5 rounded-lg border border-border-hairline text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      Mark Read
                    </button>
                  )}
                  <Link
                    to={item.link}
                    onClick={() => {
                      if (item.unread) void markRead(item.id);
                    }}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-secondary-fixed text-secondary text-label-md hover:bg-secondary hover:text-on-secondary transition-colors"
                  >
                    <span>Inspect</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
