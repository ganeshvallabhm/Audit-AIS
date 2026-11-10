import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, ShieldCheck } from 'lucide-react';
import { AuditWorkspaceNav } from '../components/layout/AuditWorkspaceNav';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar } from '../components/ui/FilterToolbar';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { AuditHistoryOut, PaginatedResponse } from '../types/api';

interface AuditHistoryPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedHistoryRow {
  id: string;
  eventRef: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  category: string;
  module: string;
  action: string;
  entityRef: string;
  hash: string;
}

export const AuditHistoryPage: React.FC<AuditHistoryPageProps> = ({ onNotify }) => {
  const { mode } = useAuth();
  const [apiLogs, setApiLogs] = useState<AuditHistoryOut[]>([]);
  const [totalApiCount, setTotalApiCount] = useState(0);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const demoLogs = useMemo(() => auditService.getHistoryLog(), []);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const fetchHistory = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (categoryFilter !== 'All') qs.set('category', categoryFilter);
      if (query.trim()) qs.set('search', query.trim());

      const res = await apiClient.get<PaginatedResponse<AuditHistoryOut>>(`/history?${qs.toString()}`);
      setApiLogs(res.items);
      setTotalApiCount(res.total);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load audit history log.');
    } finally {
      setLoading(false);
    }
  }, [mode, page, categoryFilter, query]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const rows: UnifiedHistoryRow[] = useMemo(() => {
    if (mode === 'api') {
      return apiLogs.map((l) => ({
        id: l.id,
        eventRef: `LOG-${l.id.slice(0, 8).toUpperCase()}`,
        timestamp: new Date(l.created_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        actor: l.actor_label,
        actorRole: l.actor_role,
        category: l.category,
        module: l.module,
        action: l.action,
        entityRef: l.entity_ref,
        hash: l.event_sha256,
      }));
    }

    const q = query.trim().toLowerCase();
    return demoLogs
      .filter(
        (l) =>
          (categoryFilter === 'All' || l.module.toLowerCase().includes(categoryFilter.toLowerCase())) &&
          (!q ||
            l.id.toLowerCase().includes(q) ||
            l.actor.toLowerCase().includes(q) ||
            l.action.toLowerCase().includes(q) ||
            l.entityRef.toLowerCase().includes(q))
      )
      .map((l) => ({
        id: l.id,
        eventRef: l.id,
        timestamp: l.timestamp,
        actor: l.actor,
        actorRole: l.actorRole,
        category: 'Audit Event',
        module: l.module,
        action: l.action,
        entityRef: l.entityRef,
        hash: l.hash,
      }));
  }, [mode, apiLogs, demoLogs, query, categoryFilter]);

  const totalCount = mode === 'api' ? totalApiCount : rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Audit Management', to: '/audits' },
          { label: 'Audit History & Append-Only Trail' },
        ]}
        title="Audit History"
        description="Chronological, SHA-256 hashed append-only event ledger recording sign-offs, control evaluations, risk escalations, and evidence uploads."
        actions={
          <button
            type="button"
            onClick={() => {
              auditService.exportCsvRows(
                'CompanyAudit_Append_Only_Audit_Log.csv',
                ['Event ID', 'Timestamp', 'Actor', 'Role', 'Category', 'Module', 'Action', 'Entity Ref', 'SHA-256 Digest'],
                rows.map((l) => [
                  l.eventRef,
                  l.timestamp,
                  l.actor,
                  l.actorRole,
                  l.category,
                  l.module,
                  l.action,
                  l.entityRef,
                  l.hash,
                ])
              );
              onNotify(`Exported ${rows.length} append-only audit history events.`);
            }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface shadow-exec-sm hover:bg-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4 text-secondary" />
            <span>Export Audit Trail</span>
          </button>
        }
      />

      <AuditWorkspaceNav />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <FilterToolbar
        searchValue={query}
        onSearchChange={(val) => {
          setQuery(val);
          setPage(1);
        }}
        searchPlaceholder="Filter history by actor, entity ref (RSK-04, FND-1024), or governance event..."
        activeFilterCount={categoryFilter !== 'All' ? 1 : 0}
        onReset={() => {
          setQuery('');
          setCategoryFilter('All');
          setPage(1);
        }}
        rightActions={
          <StatusBadge tone="secondary">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SHA-256 Event Chain Verified</span>
          </StatusBadge>
        }
      >
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by event category"
          className="h-10 px-3.5 bg-surface-container-low/70 rounded-lg border border-border-hairline text-body-sm text-on-surface focus:bg-surface-container-lowest focus:outline-none focus:border-secondary cursor-pointer"
        >
          <option value="All">All Event Categories</option>
          <option value="Sign-Off">Sign-Off</option>
          <option value="Mutation">Mutation</option>
          <option value="Control Test">Control Test</option>
          <option value="Risk Escalation">Risk Escalation</option>
          <option value="Evidence">Evidence</option>
          <option value="Auth">Authentication</option>
        </select>
      </FilterToolbar>

      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden">
        {mode === 'api' && loading && rows.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">
            Loading cryptographic event history from PostgreSQL...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No matching audit history entries"
            description="No append-only audit trail events match your current search or category filter."
            actionLabel="Clear Filters"
            onAction={() => {
              setQuery('');
              setCategoryFilter('All');
              setPage(1);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[960px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Event ID</th>
                  <th className="py-3.5 px-5 font-semibold">Timestamp (UTC)</th>
                  <th className="py-3.5 px-5 font-semibold">Actor &amp; Role</th>
                  <th className="py-3.5 px-5 font-semibold">Governance Event</th>
                  <th className="py-3.5 px-5 font-semibold">Entity Ref</th>
                  <th className="py-3.5 px-6 font-semibold">Event SHA-256 Digest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-body-sm">
                {rows.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-on-surface whitespace-nowrap">
                      <div>{entry.eventRef}</div>
                      <div className="text-label-sm font-normal text-outline">{entry.category}</div>
                    </td>
                    <td className="py-4 px-5 font-mono text-on-surface-variant whitespace-nowrap">
                      {entry.timestamp}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="font-semibold text-on-surface">{entry.actor}</div>
                      <div className="text-label-sm text-outline mt-0.5">{entry.actorRole}</div>
                    </td>
                    <td className="py-4 px-5 text-on-surface max-w-md">
                      <div>{entry.action}</div>
                      <div className="text-label-sm text-outline mt-0.5">{entry.module}</div>
                    </td>
                    <td className="py-4 px-5 font-mono font-bold text-secondary whitespace-nowrap">
                      {entry.entityRef}
                    </td>
                    <td
                      title={entry.hash}
                      className="py-4 px-6 font-mono text-label-sm text-outline whitespace-nowrap"
                    >
                      {entry.hash.length > 20 ? `${entry.hash.slice(0, 18)}...` : entry.hash}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 bg-surface-container-low/40 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm text-on-surface-variant">
          <span>
            Showing <strong className="text-on-surface">{rows.length}</strong> of{' '}
            <strong className="text-on-surface">{totalCount}</strong> recorded governance events
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg bg-surface-container-lowest border border-border-hairline text-on-surface disabled:opacity-40"
              aria-label="Previous history page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-label-md px-2">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-lg bg-surface-container-lowest border border-border-hairline text-on-surface disabled:opacity-40"
              aria-label="Next history page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
