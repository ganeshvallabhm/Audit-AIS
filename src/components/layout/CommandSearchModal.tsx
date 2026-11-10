import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardCheck,
  FileArchive,
  FileCheck2,
  FolderKanban,
  Layers,
  Loader2,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AUDIT_ENGAGEMENTS,
  AUDIT_FINDINGS,
  DEPARTMENT_HEALTH_LIST,
  ENTERPRISE_RISKS,
} from '../../data/mockPlatformData';
import { apiClient } from '../../services/apiClient';
import { GlobalSearchResponse, SearchResultItem } from '../../types/api';

interface CommandSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({ open, onClose }) => {
  const { mode } = useAuth();
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setApiResults([]);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || mode !== 'api') return;
    const trimmed = query.trim();
    if (!trimmed) {
      setApiResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiClient.get<GlobalSearchResponse>(
          `/search?q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled) {
          setApiResults(res.results);
        }
      } catch {
        if (!cancelled) setApiResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, mode, query]);

  const demoResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const audits = AUDIT_ENGAGEMENTS.filter(
      (a) =>
        !q ||
        a.code.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.framework.toLowerCase().includes(q)
    ).slice(0, 3);
    const risks = ENTERPRISE_RISKS.filter(
      (r) =>
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    ).slice(0, 3);
    const findings = AUDIT_FINDINGS.filter(
      (f) =>
        !q ||
        f.id.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.department.toLowerCase().includes(q)
    ).slice(0, 3);
    const depts = DEPARTMENT_HEALTH_LIST.filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
    ).slice(0, 2);

    return { audits, risks, findings, depts };
  }, [query]);

  if (!open) return null;

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const renderEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'Audit':
        return <FolderKanban className="w-4 h-4 text-secondary shrink-0" />;
      case 'Risk':
        return <ShieldAlert className="w-4 h-4 text-error shrink-0" />;
      case 'Finding':
        return <FileCheck2 className="w-4 h-4 text-secondary shrink-0" />;
      case 'Evidence':
        return <FileArchive className="w-4 h-4 text-secondary shrink-0" />;
      case 'Control':
        return <ClipboardCheck className="w-4 h-4 text-secondary shrink-0" />;
      default:
        return <Layers className="w-4 h-4 text-secondary shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl border border-outline-variant shadow-exec-lg overflow-hidden z-10">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant">
          <Search className="w-5 h-5 text-secondary shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search audit codes (AUD-2025-094), risks (RSK-04), findings (FND-1024), evidence..."
            className="w-full text-body-lg text-on-surface placeholder:text-outline focus:outline-none"
          />
          {searching && <Loader2 className="w-4 h-4 text-secondary animate-spin shrink-0" />}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {mode === 'api' ? (
            !query.trim() ? (
              <div className="p-4 space-y-2">
                <div className="text-label-sm uppercase tracking-wider text-outline mb-2">Quick Navigation</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Audit Engagements', route: '/audits' },
                    { label: 'Risk Matrix (5×5)', route: '/risk-and-compliance' },
                    { label: 'Findings & CAPA', route: '/findings-and-actions' },
                    { label: 'Audit Checklists', route: '/audits/checklists' },
                    { label: 'Evidence Vault', route: '/audits/evidence' },
                    { label: 'Audit History', route: '/audits/history' },
                  ].map((item) => (
                    <button
                      key={item.route}
                      type="button"
                      onClick={() => go(item.route)}
                      className="px-3 py-2 rounded-lg bg-surface-container-low hover:bg-secondary-fixed text-left text-label-md font-semibold text-primary transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : searching ? (
              <div className="py-8 text-center text-body-sm text-outline">Searching PostgreSQL audit telemetry...</div>
            ) : apiResults.length === 0 ? (
              <div className="py-8 text-center text-body-sm text-outline">
                No matching audits, risks, findings, controls, or evidence found for “{query}”.
              </div>
            ) : (
              <div className="space-y-1">
                {apiResults.map((item) => (
                  <button
                    key={`${item.entity_type}-${item.entity_id}`}
                    type="button"
                    onClick={() => go(item.route)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-container-low text-left transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderEntityIcon(item.entity_type)}
                      <div className="min-w-0">
                        <div className="text-headline-sm text-on-surface truncate">
                          <span className="font-mono text-secondary mr-2">{item.code}</span>
                          {item.title}
                        </div>
                        <div className="text-body-sm text-outline truncate">
                          {item.entity_type} • {item.subtitle} • {item.status}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-outline shrink-0" />
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              {demoResults.audits.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-label-sm uppercase tracking-wider text-outline">
                    Audit Engagements
                  </div>
                  <div className="space-y-1">
                    {demoResults.audits.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => go('/audits')}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-container-low text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <FolderKanban className="w-4 h-4 text-secondary" />
                          <div>
                            <div className="text-headline-sm text-on-surface">{a.title}</div>
                            <div className="font-mono text-body-sm text-outline">
                              {a.code} • {a.framework}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-outline" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {demoResults.risks.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-label-sm uppercase tracking-wider text-outline">
                    Enterprise Risks
                  </div>
                  <div className="space-y-1">
                    {demoResults.risks.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => go('/risk-and-compliance')}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-container-low text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-error" />
                          <div>
                            <div className="text-headline-sm text-on-surface">
                              <span className="font-mono text-secondary mr-2">{r.id}</span>
                              {r.title}
                            </div>
                            <div className="text-body-sm text-outline">
                              Score: {r.score} ({r.severity}) • {r.category}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-outline" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {demoResults.findings.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-label-sm uppercase tracking-wider text-outline">Audit Findings</div>
                  <div className="space-y-1">
                    {demoResults.findings.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => go('/findings-and-actions')}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-container-low text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileCheck2 className="w-4 h-4 text-secondary" />
                          <div>
                            <div className="text-headline-sm text-on-surface">
                              <span className="font-mono text-secondary mr-2">{f.id}</span>
                              {f.title}
                            </div>
                            <div className="text-body-sm text-outline">
                              {f.department} • SLA {f.targetSla}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-outline" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {demoResults.depts.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-label-sm uppercase tracking-wider text-outline">Business Units</div>
                  <div className="space-y-1">
                    {demoResults.depts.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => go('/departments')}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-container-low text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Layers className="w-4 h-4 text-secondary" />
                          <span className="text-headline-sm text-on-surface">{d.name}</span>
                        </div>
                        <span className="font-mono text-data-mono font-bold text-secondary">{d.score}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-label-sm text-outline">
          <span>
            Fiduciary Global Index • {mode === 'api' ? 'Live PostgreSQL Full Search' : 'Demo Fixture Search'}
          </span>
          <span className="font-mono">ESC to close</span>
        </div>
      </div>
    </div>
  );
};
