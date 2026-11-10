import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Download,
  Flag,
  History,
  Lock,
  Pencil,
  ShieldCheck,
  Upload,
  X,
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
  AuditHistoryOut,
  AuditOut,
  EvidenceOut,
  EvidenceUpdate,
  FindingOut,
  PaginatedResponse,
} from '../types/api';
import { EvidenceArtifact } from '../types/audit';

interface EvidenceManagementPageProps {
  onNotify: (msg: string) => void;
}

interface UnifiedEvidenceRow {
  id: string;
  code: string;
  filename: string;
  sizeLabel: string;
  tag: string;
  auditId: string | null;
  findingId: string | null;
  auditCode: string;
  department: string;
  uploadedBy: string;
  uploadedAt: string;
  sha256: string;
  status: 'Verified' | 'Pending Review' | 'Flagged';
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const EvidenceManagementPage: React.FC<EvidenceManagementPageProps> = ({ onNotify }) => {
  const { mode, hasRole } = useAuth();
  const canUpload = hasRole('Admin', 'Auditor', 'Department Head');
  const canVerify = hasRole('Admin', 'Auditor');

  // API state
  const [apiArtifacts, setApiArtifacts] = useState<EvidenceOut[]>([]);
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [findings, setFindings] = useState<FindingOut[]>([]);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Demo state
  const [demoArtifacts, setDemoArtifacts] = useState<EvidenceArtifact[]>(() =>
    auditService.getEvidenceArtifacts()
  );

  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [selectedFindingId, setSelectedFindingId] = useState('');
  const [tagInput, setTagInput] = useState('SOC 2 Type II');
  const [uploading, setUploading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

  // Edit Metadata Modal
  const [editingEvidence, setEditingEvidence] = useState<UnifiedEvidenceRow | null>(null);
  const [editTag, setEditTag] = useState('');
  const [editAuditId, setEditAuditId] = useState('');
  const [editFindingId, setEditFindingId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Custody History Modal
  const [historyTarget, setHistoryTarget] = useState<UnifiedEvidenceRow | null>(null);
  const [historyRows, setHistoryRows] = useState<AuditHistoryOut[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchEvidence = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [evRes, audRes, fndRes] = await Promise.all([
        apiClient.get<PaginatedResponse<EvidenceOut>>('/evidence?limit=100'),
        apiClient.get<PaginatedResponse<AuditOut>>('/audits?limit=100'),
        apiClient.get<PaginatedResponse<FindingOut>>('/findings?limit=100'),
      ]);
      setApiArtifacts(evRes.items);
      setAudits(audRes.items);
      setFindings(fndRes.items);
      setSelectedAuditId((prev) => prev || (audRes.items[0]?.id ?? ''));
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load evidence artifacts.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchEvidence();
  }, [fetchEvidence]);

  const rows: UnifiedEvidenceRow[] = useMemo(() => {
    if (mode === 'api') {
      return apiArtifacts.map((e) => ({
        id: e.id,
        code: e.code,
        filename: e.original_filename,
        sizeLabel: formatByteSize(e.byte_size),
        tag: e.tag || 'Control Artifact',
        auditId: e.audit_id,
        findingId: e.finding_id,
        auditCode: e.audit_code || e.finding_code || 'Unlinked',
        department: e.department_name || 'Enterprise',
        uploadedBy: e.uploaded_by_name,
        uploadedAt: new Date(e.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        sha256: e.sha256_hash,
        status: e.verification_status,
      }));
    }
    return demoArtifacts.map((a) => ({
      id: a.id,
      code: a.id,
      filename: a.filename,
      sizeLabel: a.size,
      tag: a.tag,
      auditId: null,
      findingId: null,
      auditCode: a.auditCode,
      department: a.department,
      uploadedBy: a.uploadedBy,
      uploadedAt: a.uploadedAt,
      sha256: a.sha256,
      status: a.status,
    }));
  }, [mode, apiArtifacts, demoArtifacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (a) =>
        !q ||
        a.code.toLowerCase().includes(q) ||
        a.filename.toLowerCase().includes(q) ||
        a.auditCode.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q) ||
        a.sha256.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload) return;

    if (mode === 'demo') {
      const nextId = `EVD-${4092 + demoArtifacts.length}`;
      const created: EvidenceArtifact = {
        id: nextId,
        filename: selectedFile?.name || `soc2_control_attestation_q4_${demoArtifacts.length + 1}.pdf`,
        size: selectedFile ? formatByteSize(selectedFile.size) : '1.4 MB',
        tag: tagInput || 'SOC 2 Type II',
        auditCode: 'AUD-2025-094',
        department: 'Technology / SecOps',
        uploadedBy: 'Demo User',
        uploadedAt: 'Today',
        sha256: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
        status: 'Pending Review',
      };
      setDemoArtifacts((prev) => [created, ...prev]);
      setUploadOpen(false);
      setSelectedFile(null);
      onNotify(`Uploaded ${created.filename} (${nextId}) into Demo Evidence Vault.`);
      return;
    }

    if (!selectedFile) {
      onNotify('Select a valid file (.pdf, .png, .jpg, .csv, .txt, .json, .docx, .xlsx) to upload.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (selectedAuditId) formData.append('audit_id', selectedAuditId);
      if (selectedFindingId) formData.append('finding_id', selectedFindingId);
      if (tagInput.trim()) formData.append('tag', tagInput.trim());

      const created = await apiClient.uploadForm<EvidenceOut>('/evidence', formData);
      setUploadOpen(false);
      setSelectedFile(null);
      onNotify(
        `Uploaded ${created.original_filename} (${created.code}) with SHA-256 ${created.sha256_hash.slice(0, 12)}...`
      );
      await fetchEvidence();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Evidence upload rejected.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (ev: UnifiedEvidenceRow) => {
    if (mode === 'demo') {
      onNotify(`Downloaded attested artifact ${ev.filename} (${ev.sizeLabel}) [Demo].`);
      return;
    }
    try {
      const { blob, filename, sha256 } = await apiClient.downloadBlob(`/evidence/${ev.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(
        `Verified checksum & downloaded ${filename}${sha256 ? ` (SHA-256: ${sha256.slice(0, 12)}...)` : ''}.`
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to download evidence file.');
    }
  };

  const handleVerify = async (ev: UnifiedEvidenceRow) => {
    if (!canVerify || mode !== 'api') return;
    setVerifyingId(ev.id);
    try {
      const updated = await apiClient.put<EvidenceOut>(`/evidence/${ev.id}/verify`, {
        verification_status: 'Verified',
        verify_file_checksum: true,
      });
      onNotify(`Checksum verified against disk for ${updated.code}; marked Verified.`);
      await fetchEvidence();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Checksum verification failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleFlag = async (ev: UnifiedEvidenceRow) => {
    if (!canVerify || mode !== 'api') return;
    setFlaggingId(ev.id);
    try {
      const updated = await apiClient.put<EvidenceOut>(`/evidence/${ev.id}/verify`, {
        verification_status: 'Flagged',
        verify_file_checksum: false,
      });
      onNotify(`Flagged ${updated.code} for evidence remediation or custodian follow-up.`);
      await fetchEvidence();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to flag evidence artifact.');
    } finally {
      setFlaggingId(null);
    }
  };

  const openEditModal = (ev: UnifiedEvidenceRow) => {
    setEditingEvidence(ev);
    setEditTag(ev.tag);
    setEditAuditId(ev.auditId || '');
    setEditFindingId(ev.findingId || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvidence || !canUpload || mode !== 'api') return;
    setEditSaving(true);
    setEditError(null);
    try {
      const payload: EvidenceUpdate = {
        tag: editTag.trim() || null,
      };
      const nextAuditId = editAuditId || null;
      const nextFindingId = editFindingId || null;
      if (nextAuditId !== editingEvidence.auditId) {
        payload.audit_id = nextAuditId;
      }
      if (nextFindingId !== editingEvidence.findingId) {
        payload.finding_id = nextFindingId;
      }
      const updated = await apiClient.put<EvidenceOut>(`/evidence/${editingEvidence.id}`, payload);
      setEditingEvidence(null);
      onNotify(`Updated metadata and linkage for ${updated.code}.`);
      await fetchEvidence();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Failed to update evidence metadata.';
      setEditError(msg);
      onNotify(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const openCustodyHistory = async (ev: UnifiedEvidenceRow) => {
    if (mode !== 'api') return;
    setHistoryTarget(ev);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await apiClient.get<AuditHistoryOut[]>(`/evidence/${ev.id}/history`);
      setHistoryRows(res);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to load custody history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Audit Management', to: '/audits' },
          { label: 'Evidence Management Vault' },
        ]}
        title="Evidence Management"
        description="Cryptographically hashed SHA-256 workpapers, system telemetry exports, and statutory compliance artifacts."
        actions={
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => setUploadOpen(true)}
            title={canUpload ? 'Upload attested evidence artifact' : 'Admin, Auditor, or Department Head required'}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg shadow-exec-sm hover:bg-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {!canUpload ? <Lock className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
            <span>Upload Attested Evidence</span>
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
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search evidence ID, filename, audit ref, or SHA-256..."
        onReset={() => setSearch('')}
        rightActions={
          <StatusBadge tone="secondary">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SHA-256 Verified Vault</span>
          </StatusBadge>
        }
      />

      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm overflow-hidden">
        {mode === 'api' && loading && filtered.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-outline">Loading evidence vault...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matching evidence artifacts"
            description="No SHA-256 attested workpapers match your current search filter."
            actionLabel="Clear Search"
            onAction={() => setSearch('')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead>
                <tr className="bg-surface-container-low/80 text-outline text-label-sm uppercase tracking-wider border-b border-surface-container">
                  <th className="py-3.5 px-6 font-semibold">Artifact ID</th>
                  <th className="py-3.5 px-5 font-semibold">Filename &amp; SHA-256 Digest</th>
                  <th className="py-3.5 px-5 font-semibold">Linked Ref</th>
                  <th className="py-3.5 px-5 font-semibold">Department</th>
                  <th className="py-3.5 px-5 font-semibold">Custodian</th>
                  <th className="py-3.5 px-5 font-semibold">Verification</th>
                  <th className="py-3.5 px-6 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container text-body-sm">
                {filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-secondary whitespace-nowrap">{ev.code}</td>
                    <td className="py-4 px-5">
                      <div className="font-mono text-headline-sm text-on-surface font-semibold">
                        {ev.filename}{' '}
                        <span className="text-label-sm text-outline font-normal ml-1">({ev.sizeLabel})</span>
                      </div>
                      <div
                        title={ev.sha256}
                        className="font-mono text-label-sm text-outline truncate max-w-md mt-0.5"
                      >
                        SHA-256: {ev.sha256}
                      </div>
                    </td>
                    <td className="py-4 px-5 font-mono text-on-surface whitespace-nowrap">{ev.auditCode}</td>
                    <td className="py-4 px-5 text-on-surface-variant whitespace-nowrap">{ev.department}</td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="text-on-surface font-medium">{ev.uploadedBy}</div>
                      <div className="font-mono text-label-sm text-outline mt-0.5">{ev.uploadedAt}</div>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <StatusBadge
                        tone={
                          ev.status === 'Verified'
                            ? 'success'
                            : ev.status === 'Flagged'
                              ? 'danger'
                              : 'secondary'
                        }
                      >
                        <BadgeCheck className="w-3.5 h-3.5" />
                        <span>{ev.status}</span>
                      </StatusBadge>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {mode === 'api' && canVerify && ev.status !== 'Verified' && (
                          <button
                            type="button"
                            disabled={verifyingId === ev.id}
                            onClick={() => void handleVerify(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-label-sm font-semibold hover:bg-emerald-100 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{verifyingId === ev.id ? 'Checking...' : 'Verify SHA-256'}</span>
                          </button>
                        )}
                        {mode === 'api' && canVerify && ev.status !== 'Flagged' && (
                          <button
                            type="button"
                            disabled={flaggingId === ev.id}
                            onClick={() => void handleFlag(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-error/30 text-error hover:bg-error-container/40 text-label-sm font-semibold transition-colors"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            <span>{flaggingId === ev.id ? 'Flagging...' : 'Flag'}</span>
                          </button>
                        )}
                        {mode === 'api' && canUpload && (
                          <button
                            type="button"
                            onClick={() => openEditModal(ev)}
                            className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-secondary transition-colors"
                            aria-label={`Edit metadata for ${ev.code}`}
                            title="Edit tag or linkage"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {mode === 'api' && (
                          <button
                            type="button"
                            onClick={() => void openCustodyHistory(ev)}
                            className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-secondary transition-colors"
                            aria-label={`View custody history for ${ev.code}`}
                            title="Custody History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDownload(ev)}
                          className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors"
                          aria-label={`Download ${ev.filename}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Evidence Metadata Modal */}
      {editingEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]"
            onClick={() => setEditingEvidence(null)}
          />
          <form
            onSubmit={handleSaveEdit}
            className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <div>
                <span className="font-mono text-label-sm font-bold text-secondary">{editingEvidence.code}</span>
                <h2 className="text-headline-lg text-primary font-bold">Edit Evidence Metadata &amp; Linkage</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvidence(null)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editingEvidence.status === 'Verified' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-body-sm flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    This artifact is <strong>Verified</strong>. While Enterprise SHA-256 Lock is active in
                    Governance Settings, modifying audit or finding linkage is blocked by the server.
                  </span>
                </div>
              )}
              {editError && (
                <div className="p-3 rounded-lg bg-error-container text-on-error-container border border-error/25 text-body-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Control / Framework Tag
                </label>
                <input
                  type="text"
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Linked Audit
                  </label>
                  <select
                    value={editAuditId}
                    onChange={(e) => setEditAuditId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  >
                    <option value="">None</option>
                    {audits.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.title.slice(0, 26)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                    Linked Finding
                  </label>
                  <select
                    value={editFindingId}
                    onChange={(e) => setEditFindingId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                  >
                    <option value="">None</option>
                    {findings.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.title.slice(0, 26)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingEvidence(null)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-60"
              >
                {editSaving ? 'Saving...' : 'Save Metadata'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Evidence Custody History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]"
            onClick={() => setHistoryTarget(null)}
          />
          <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <div>
                <span className="font-mono text-label-sm font-bold text-secondary">{historyTarget.code}</span>
                <h2 className="text-headline-lg text-primary font-bold">Chain-of-Custody History</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {historyLoading ? (
                <p className="text-body-sm text-outline">Loading cryptographic custody ledger...</p>
              ) : historyRows.length === 0 ? (
                <p className="text-body-sm text-outline">No custody events logged yet for {historyTarget.code}.</p>
              ) : (
                historyRows.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-label-lg font-bold text-on-surface">{entry.action}</span>
                      <span className="font-mono text-label-sm text-outline">
                        {new Date(entry.created_at).toISOString().replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>
                    <div className="text-body-sm text-on-surface-variant">
                      Actor: <strong>{entry.actor_label}</strong> ({entry.actor_role})
                    </div>
                    <div className="font-mono text-[11px] text-outline truncate">
                      Event SHA-256: {entry.event_sha256}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multipart Upload Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setUploadOpen(false)} />
          <form
            onSubmit={handleUploadSubmit}
            className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <h2 className="text-headline-lg text-primary">Upload Attested Evidence Artifact</h2>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Evidence File (Max 25 MB; PDF, PNG, JPG, CSV, TXT, DOCX, XLSX, JSON, ZIP)
                </label>
                <input
                  type="file"
                  required={mode === 'api'}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.docx,.json,.log,.zip"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-body-sm text-on-surface file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-secondary-fixed file:text-secondary file:font-semibold hover:file:bg-secondary hover:file:text-on-secondary"
                />
              </div>
              {mode === 'api' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Link Audit (Optional)
                    </label>
                    <select
                      value={selectedAuditId}
                      onChange={(e) => setSelectedAuditId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      <option value="">None</option>
                      {audits.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.title.slice(0, 28)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                      Link Finding (Optional)
                    </label>
                    <select
                      value={selectedFindingId}
                      onChange={(e) => setSelectedFindingId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border-hairline text-body-sm bg-surface-container-lowest"
                    >
                      <option value="">None</option>
                      {findings.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.title.slice(0, 28)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">
                  Control / Standard Tag
                </label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g. SOC 2 CC6.1 / SOX 404"
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-60"
              >
                {uploading ? 'Hashing & Saving...' : 'Upload & Hash SHA-256'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
