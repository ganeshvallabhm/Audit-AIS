import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, PlusCircle, ShieldAlert, X } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { DepartmentOut } from '../types/api';

interface DepartmentsPageProps {
  onNotify?: (msg: string) => void;
}

interface UnifiedDepartmentRow {
  id: string;
  code: string;
  name: string;
  head: string;
  score: number;
  target: number;
  activeAudits: number;
  openFindings: number;
  attentionArea: boolean;
  note?: string | null;
}

export const DepartmentsPage: React.FC<DepartmentsPageProps> = ({ onNotify }) => {
  const { mode, hasRole } = useAuth();
  const [filterMode, setFilterMode] = useState<'all' | 'attention'>('all');
  const [apiDepartments, setApiDepartments] = useState<DepartmentOut[]>([]);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('85');
  const [newWeight, setNewWeight] = useState('0.10');
  const [creating, setCreating] = useState(false);

  const canManage = hasRole('Admin');

  const fetchDepartments = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const rows = await apiClient.get<DepartmentOut[]>('/departments');
      setApiDepartments(rows);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load department health.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  const demoDepartments = useMemo(() => auditService.getDepartmentHealth(), []);

  const departments: UnifiedDepartmentRow[] = useMemo(() => {
    if (mode === 'api') {
      return apiDepartments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        head: d.head_name || 'Unassigned',
        score: d.score ?? 85,
        target: d.target_score,
        activeAudits: d.active_audits,
        openFindings: d.open_findings,
        attentionArea: d.attention_area,
        note: d.attention_note,
      }));
    }
    return demoDepartments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      head: d.head,
      score: d.score,
      target: d.target,
      activeAudits: d.activeAudits,
      openFindings: d.openFindings,
      attentionArea: Boolean(d.attentionArea),
      note: d.note,
    }));
  }, [mode, apiDepartments, demoDepartments]);

  const visibleDepartments = useMemo(() => {
    if (filterMode === 'attention') {
      return departments.filter((d) => d.attentionArea || d.score < d.target);
    }
    return departments;
  }, [departments, filterMode]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !newCode.trim() || !newName.trim()) return;
    if (mode === 'demo') {
      setCreateOpen(false);
      onNotify?.('Department creation requires live PostgreSQL API mode as Admin.');
      return;
    }
    setCreating(true);
    try {
      const created = await apiClient.post<DepartmentOut>('/departments', {
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        target_score: Number(newTarget) || 85,
        scoring_weight: Number(newWeight) || 0.1,
      });
      setNewCode('');
      setNewName('');
      setCreateOpen(false);
      onNotify?.(`Provisioned business unit ${created.code}: ${created.name}.`);
      await fetchDepartments();
    } catch (err) {
      onNotify?.(err instanceof ApiError ? err.detail : 'Failed to create department.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Executive Overview', to: '/dashboard' },
          { label: 'Departments & Business Units' },
        ]}
        title={`Departments & Business Units (${departments.length})`}
        description="Composite audit health scores, open remediation counts, and executive accountability across all enterprise divisions."
        actions={
          <>
            <div className="inline-flex items-center p-1 rounded-xl bg-surface-container-low border border-border-hairline/80">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3.5 py-1.5 rounded-lg text-label-md transition-colors ${
                  filterMode === 'all'
                    ? 'bg-surface-container-lowest text-primary font-bold shadow-exec-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All Units ({departments.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('attention')}
                className={`px-3.5 py-1.5 rounded-lg text-label-md transition-colors ${
                  filterMode === 'attention'
                    ? 'bg-surface-container-lowest text-secondary font-bold shadow-exec-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Below Target
              </button>
            </div>
            {canManage && mode === 'api' && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg shadow-exec-sm hover:bg-secondary-container transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Add Unit</span>
              </button>
            )}
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface shadow-exec-sm hover:bg-surface-container-low transition-colors"
            >
              <span>← Executive Overview</span>
            </Link>
          </>
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {mode === 'api' && loading && departments.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 rounded-xl bg-surface-container-lowest border border-border-hairline animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {visibleDepartments.map((dept) => (
            <div
              key={dept.id}
              className={`rounded-xl p-6 border shadow-exec-sm flex flex-col justify-between gap-5 transition-shadow hover:shadow-exec-md ${
                dept.attentionArea
                  ? 'bg-surface-container-low/80 border-secondary/40'
                  : 'bg-surface-container-lowest border-border-hairline/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-label-md font-bold text-secondary">{dept.code}</span>
                  {dept.attentionArea ? (
                    <StatusBadge tone="info">Attention Area</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Above 80% Floor</StatusBadge>
                  )}
                </div>
                <h2 className="text-headline-md text-primary font-bold">{dept.name}</h2>
                <p className="text-body-sm text-outline mt-1">Unit Head: {dept.head}</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-display-md font-extrabold text-primary font-mono tabular-nums">
                    {dept.score.toFixed(1)}%
                  </span>
                  <span className="text-label-sm text-outline">Target: {dept.target}%</span>
                </div>
                <ProgressBar
                  value={dept.score}
                  heightClass="h-2"
                  trackClass="bg-surface-container-high"
                  fillClass={dept.attentionArea ? 'bg-error' : 'bg-secondary'}
                />
                {dept.note && <p className="text-body-sm text-on-surface-variant mt-2.5 leading-relaxed">{dept.note}</p>}
              </div>

              <div className="pt-3.5 border-t border-surface-container flex items-center justify-between text-label-sm">
                <span className="text-on-surface-variant">
                  {dept.activeAudits} Audits •{' '}
                  <strong className={dept.openFindings > 3 ? 'text-error' : 'text-on-surface'}>
                    {dept.openFindings} Open Findings
                  </strong>
                </span>
                <Link
                  to="/findings-and-actions"
                  className="inline-flex items-center gap-1 text-secondary font-semibold hover:underline"
                >
                  <span>Inspect</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-5 rounded-xl bg-surface-container-lowest border border-border-hairline/80 shadow-exec-sm flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 text-body-sm text-on-surface-variant">
          <ShieldAlert className="w-4 h-4 text-secondary shrink-0" />
          <span>Minimum enterprise compliance composite floor is enforced at 80.0% across all business units.</span>
        </div>
        <Link to="/audits" className="text-label-lg text-secondary font-semibold hover:underline">
          View Active Departmental Audits →
        </Link>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setCreateOpen(false)} />
          <form
            onSubmit={handleCreateDepartment}
            className="relative w-full max-w-md bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <h2 className="text-headline-lg text-primary">Add Department / Unit</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Department Code</label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. ENG-09"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md font-mono uppercase focus:outline-none focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Unit Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Platform Reliability Engineering"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Target (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    step="0.5"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Weight (0-1)</label>
                  <input
                    type="number"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md font-mono focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create Unit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
