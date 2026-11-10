import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { NotificationOut } from '../types/api';
import { useAuth } from './AuthContext';

export interface UnifiedNotification {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  severity: 'critical' | 'warning' | 'info';
  unread: boolean;
  link: string;
}

interface NotificationContextValue {
  notifications: UnifiedNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, user } = useAuth();
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (mode === 'demo') {
      setNotifications(
        auditService.getInitialNotifications().map((n) => ({
          id: n.id,
          title: n.title,
          description: n.description,
          timeLabel: n.time,
          severity: n.severity,
          unread: n.unread,
          link: n.link,
        }))
      );
      return;
    }

    if (mode !== 'api' || !user) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await apiClient.get<NotificationOut[]>('/notifications');
      setNotifications(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          timeLabel: formatRelativeTime(r.created_at),
          severity: r.severity,
          unread: !r.is_read,
          link: r.target_link || '/notifications',
        }))
      );
    } catch {
      // Silently preserve existing items if transient network issue
    } finally {
      setLoading(false);
    }
  }, [mode, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      if (mode === 'demo') {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: !n.unread } : n)));
        return;
      }
      if (mode !== 'api') return;
      try {
        await apiClient.put<NotificationOut>(`/notifications/${id}/read`, {});
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
      } catch {
        // Ignore transient failure
      }
    },
    [mode]
  );

  const markAllRead = useCallback(async () => {
    if (mode === 'demo') {
      setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
      return;
    }
    if (mode !== 'api') return;
    try {
      await apiClient.put('/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    } catch {
      // Ignore transient failure
    }
  }, [mode]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, refresh, markRead, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return ctx;
}

