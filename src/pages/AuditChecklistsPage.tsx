import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Lock,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import { AuditWorkspaceNav } from '../components/layout/AuditWorkspaceNav';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterToolbar } from '../components/ui/FilterToolbar';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import {
  AuditDomainLiteral,
  AuditOut,
  ChecklistOut,
  PaginatedResponse,
  ResponseValueLiteral,
  SubmitAuditResponsesResult,
} from '../types/api';
import { AuditDomain, ChecklistItem } from '../types/audit';

interface AuditChecklistsPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedChecklistRow {
  id: string;
  controlId: string;
  framework: string;
  domain: AuditDomainLiteral;
  title: string;
  procedure: string;
  weight: number;
  owner: string;
  responseValue: ResponseValueLiteral | null;
  demoStatus: ChecklistItem['status'];
  evidenceCount: number;
  lastTested: string;
}

const RESPONSE_CHOICES: ResponseValueLiteral[] = ['Pass', 'Partial', 'Fail', 'N/A'];

export const AuditChecklistsPage: React.FC<AuditChecklistsPageProps> = ({ onNotify }) => {
  const { mode, hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialDomain = (searchParams.get('domain') as AuditDomainLiteral | null) || 'All';
  const [domainFilter, setDomainFilter] = useState<'All' | AuditDomainLiteral>(initialDomain);
  const [selectedAuditId, setSelectedAuditId] = useState<string>(searchParams.get('auditId') || '');
  const [query, setQuery] = useState('');

  // API state
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [checklists, setChecklists] = useState<ChecklistOut[]>([]);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Demo state
  const [demoItems, setDemoItems] = useState<ChecklistItem[]>(() => auditService.getChecklists());

  const canEvaluate = hasRole('Admin', 'Auditor');

  const fetchAll = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const auditsRes = await apiClient.get<PaginatedResponse<AuditOut>>('/audits?limit=100');
      setAudits(auditsRes.items);

      let activeId = selectedAuditId;
      if (!activeId && auditsRes.items.length > 0) {
        activeId = auditsRes.items[0].id;
        setSelectedAuditId(activeId);
      }

      const chkQs = new URLSearchParams();
      if (domainFilter !== 'All') chkQs.set('domain', domainFilter);
      if (activeId) chkQs.set('audit_id', activeId);

      const chkRes = await apiClient.get<ChecklistOut[]>(`/checklists?${chkQs.toString()}`);
      setChecklists(chkRes);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load checklists from PostgreSQL.');
    } finally {
      setLoading(false);
    }
  }, [mode, selectedAuditId, domainFilter]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const selectedAudit = useMemo(
    () => audits.find((a) => a.id === selectedAuditId) || null,
    [audits, selectedAuditId]
  );

  const unifiedRows: UnifiedChecklistRow[] = useMemo(() => {
    if (mode === 'api') {
      return checklists.flatMap((chk) =>
        chk.items.map((item) => ({
          id: item.id,
          controlId: item.control_code,
          framework: item.framework || chk.framework,
          domain: item.domain,
          title: item.title,
          procedure: item.test_procedure,
          weight: item.weight,
          owner: item.responder_name || 'Unassigned',
          responseValue: item.latest_response,
          demoStatus: 'Not Started' as const,
          evidenceCount: item.evidence_count,
          lastTested: item.latest_tested_at ? item.latest_tested_at.slice(0, 10) : 'Pending',
        }))
      );
    }

    return demoItems.map((c) => ({
      id: c.id,
      controlId: c.controlId,
      framework: c.framework,
      domain: c.domain,
      title: c.title,
      procedure: c.procedure,
      weight: 1.0,
      owner: c.owner,
      responseValue:
        c.status === 'Passed'
          ? 'Pass'
          : c.status === 'Exception'
            ? 'Fail'
            : c.status === 'In Testing'
              ? 'Partial'
              : null,
      demoStatus: c.status,
      evidenceCount: c.evidenceCount,
      lastTested: c.lastTested,
    }));
  }, [mode, checklists, demoItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return unifiedRows.filter((item) => {
      const matchesDomain = domainFilter === 'All' || item.domain === domainFilter;
      const matchesQuery =
        !q ||
        item.controlId.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.framework.toLowerCase().includes(q) ||
        item.owner.toLowerCase().includes(q);
      return matchesDomain && matchesQuery;
    });
  }, [unifiedRows, domainFilter, query]);

  const submitDisposition = async (row: UnifiedChecklistRow, value: ResponseValueLiteral) => {
    if (!canEvaluate) {
      onNotify('Only Admin or Auditor roles can record control test dispositions.');
      return;
    }

    if (mode === 'demo') {
      const demoStatusMap: Record<ResponseValueLiteral, ChecklistItem['status']> = {
        Pass: 'Passed',
        Partial: 'In Testing',
        Fail: 'Exception',
        'N/A': 'Not Started',
      };
      setDemoItems((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, status: demoStatusMap[value], lastTested: 'Today (Demo)' }
            : item
        )
      );
      onNotify(`Control ${row.controlId} test disposition updated to "${value}" (Demo).`);
      return;
    }

    if (!selectedAudit) {
      onNotify('Select a target Audit Engagement first to evaluate controls.');
      return;
    }

    setSubmittingId(row.id);
    try {
      const result = await apiClient.post<SubmitAuditResponsesResult>(
        `/audits/${selectedAudit.id}/responses`,
        {
          responses: [
            {
              checklist_item_id: row.id,
              response_value: value,
              auditor_notes: `Evaluated ${value} via Control Testing Workbench.`,
            },
          ],
        }
      );
      onNotify(
        `Saved ${row.controlId} = ${value} on ${result.audit_code}. Weighted audit score recalculated to ${
          result.computed_score !== null ? `${result.computed_score.toFixed(1)}%` : 'N/A'
        }.`
      );
      await fetchAll();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to save control response.');
    } finally {
      setSubmittingId(null);
    }
  };

  const getBadgeStyle = (val: ResponseValueLiteral | null, demoSt: ChecklistItem['status']) => {
    if (val === 'Pass' || demoSt === 'Passed') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (val === 'Fail' || demoSt === 'Exception') {
      return 'bg-error-container text-on-error-container';
    }
    if (val === 'Partial' || demoSt === 'In Testing') {
      return 'bg-surface-container-highest text-secondary';
    }
    return 'bg-surface-container text-outline';
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Audit Management', to: '/audits' },
          { label: 'Audit Checklists & Control Matrix' },
        ]}
        title="Audit Checklists & Control Matrix"
        description="Execute standardized SOX 404, SOC 2 Type II, ISO/IEC 27001, and GDPR weighted control testing procedures."
        actions={
          <button
            type="button"
            onClick={() => {
              auditService.exportCsvRows(
                'CompanyAudit_Control_Checklist.csv',
                ['Control ID', 'Framework', 'Domain', 'Control Title', 'Weight', 'Disposition', 'Evidence Count'],
                filtered.map((c) => [
                  c.controlId,
                  c.framework,
                  c.domain,
                  c.title,
                  c.weight,
                  c.responseValue || c.demoStatus,
                  c.evidenceCount,
                ])
              );
              onNotify('Exported Audit Checklist workpaper CSV.');
            }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface shadow-exec-sm hover:bg-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4 text-secondary" />
            <span>Export Workpapers</span>
          </button>
        }
      />

      <AuditWorkspaceNav />

      {/* Target Audit Engagement Context Strip (Live API Mode) */}
      {mode === 'api' && audits.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-border-hairline/80 shadow-exec-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-label-sm uppercase tracking-wider text-outline font-bold">
                Target Audit Engagement (Server-Weighted Formula)
              </span>
              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                <select
                  aria-label="Target Audit Engagement"
                  value={selectedAuditId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedAuditId(nextId);
                    const nextAud = audits.find((a) => a.id === nextId);
                    const nextParams: Record<string, string> = { auditId: nextId };
                    if (nextAud) {
                      nextParams.domain = nextAud.domain;
                      setDomainFilter(nextAud.domain);
                    }
                    setSearchParams(nextParams);
                  }}
                  className="h-9 px-3 rounded-lg bg-surface-container-low border border-border-hairline text-body-sm font-semibold text-primary focus:outline-none focus:border-secondary"
                >
                  {audits.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.title} ({a.domain})
                    </option>
                  ))}
                </select>
                {selectedAudit && (
                  <StatusBadge tone={selectedAudit.status === 'Closed' ? 'success' : 'secondary'}>
                    {selectedAudit.status}
                  </StatusBadge>
                )}
              </div>
            </div>
          </div>

          {selectedAudit && (
            <div className="flex items-center gap-6 bg-surface-container-low/80 px-4 py-2.5 rounded-xl border border-border-hairline/70">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-outline block">Weighted Score</span>
                <span className="font-mono text-headline-md font-extrabold text-secondary tabular-nums">
                  {selectedAudit.computed_score !== null ? `${selectedAudit.computed_score.toFixed(1)}%` : 'Pending'}
                </span>
              </div>
              <div className="h-8 w-px bg-border-hairline" />
              <div>
                <span className="text-[11px] uppercase tracking-wider text-outline block">Controls Tested</span>
                <span className="font-mono text-headline-sm font-bold text-primary tabular-nums">
                  {selectedAudit.controls_evaluated} / {selectedAudit.controls_total}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <FilterToolbar
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search control ID, framework, objective, or responder..."
        activeFilterCount={domainFilter !== 'All' ? 1 : 0}
        onReset={() => {
          setQuery('');
          setDomainFilter('All');
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {(['All', 'Technology', 'Financial', 'HR', 'Customer', 'Project', 'Operations'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomainFilter(d as 'All' | AuditDomain)}
              className={`px-3 py-1.5 rounded-lg text-label-md transition-colors ${
                domainFilter === d
                  ? 'bg-secondary text-on-secondary font-semibold'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </FilterToolbar>

      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden">
        {mode === 'api' && loading && filtered.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading checklist procedures...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matching control procedures"
            description="No audit checklist controls match your domain or keyword filter."
            actionLabel="Show All Domains"
            onAction={() => {
              setQuery('');
              setDomainFilter('All');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Control ID</th>
                  <th className="py-3.5 px-5 font-semibold">Control Objective &amp; Test Procedure</th>
                  <th className="py-3.5 px-5 font-semibold">Framework</th>
                  <th className="py-3.5 px-5 font-semibold">Domain / Wt</th>
                  <th className="py-3.5 px-5 font-semibold">Tested By</th>
                  <th className="py-3.5 px-5 font-semibold">Evidence</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Evaluate Disposition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-body-sm">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-secondary whitespace-nowrap">{c.controlId}</td>
                    <td className="py-4 px-5 max-w-md">
                      <div className="text-headline-sm text-on-surface font-semibold">{c.title}</div>
                      <div className="text-body-sm text-on-surface-variant mt-0.5 line-clamp-2">{c.procedure}</div>
                    </td>
                    <td className="py-4 px-5 text-on-surface whitespace-nowrap">{c.framework}</td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone="neutral">{c.domain}</StatusBadge>
                        <span className="font-mono text-label-sm text-outline">w={c.weight}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-on-surface whitespace-nowrap">
                      <div>{c.owner}</div>
                      <div className="font-mono text-label-sm text-outline">{c.lastTested}</div>
                    </td>
                    <td className="py-4 px-5 font-mono text-on-surface-variant whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4 text-secondary" />
                        <span>
                          {c.evidenceCount} {c.evidenceCount === 1 ? 'file' : 'files'}
                        </span>
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-label-sm font-semibold ${getBadgeStyle(
                            c.responseValue,
                            c.demoStatus
                          )}`}
                        >
                          {c.responseValue === 'Pass' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {c.responseValue === 'Fail' && <AlertCircle className="w-3.5 h-3.5" />}
                          {c.responseValue === 'Partial' && <RefreshCw className="w-3.5 h-3.5" />}
                          {!c.responseValue && <Clock className="w-3.5 h-3.5" />}
                          <span>{c.responseValue || c.demoStatus}</span>
                        </span>

                        {canEvaluate ? (
                          <div className="inline-flex rounded-lg border border-border-hairline bg-surface-container-low p-0.5">
                            {RESPONSE_CHOICES.map((choice) => {
                              const active = c.responseValue === choice;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  disabled={
                                    submittingId === c.id || (mode === 'api' && selectedAudit?.status === 'Closed')
                                  }
                                  onClick={() => void submitDisposition(c, choice)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                    active
                                      ? 'bg-secondary text-on-secondary shadow-exec-sm'
                                      : 'text-on-surface-variant hover:text-primary'
                                  }`}
                                >
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span
                            title="Auditor or Admin role required"
                            className="inline-flex items-center gap-1 text-label-sm text-outline ml-1"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
