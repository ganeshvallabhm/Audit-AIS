import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  Building2,
  CheckCircle2,
  Edit3,
  FileCheck2,
  Globe,
  Landmark,
  Scale,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { COMPANY_PROFILE, CURRENT_USER } from '../data/mockPlatformData';
import { ApiError, apiClient } from '../services/apiClient';
import { auditService } from '../services/auditService';
import { CompanyProfileOut } from '../types/api';

interface CompanyProfilePageProps {
  onNotify: (msg: string) => void;
}

export const CompanyProfilePage: React.FC<CompanyProfilePageProps> = ({ onNotify }) => {
  const { mode, user, hasRole } = useAuth();
  const [company, setCompany] = useState<CompanyProfileOut | null>(null);
  const [loading, setLoading] = useState(mode === 'api');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [auditChair, setAuditChair] = useState('');
  const [externalAuditor, setExternalAuditor] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = hasRole('Admin', 'Management');

  const fetchCompany = useCallback(async () => {
    if (mode !== 'api') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiClient.get<CompanyProfileOut>('/company');
      setCompany(data);
      setLegalName(data.legal_name);
      setHeadquarters(data.headquarters || '');
      setAuditChair(data.audit_committee_chair || '');
      setExternalAuditor(data.external_auditor || '');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.detail : 'Failed to load company profile.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchCompany();
  }, [fetchCompany]);

  const profileData = {
    legalName: company?.legal_name ?? COMPANY_PROFILE.legalName,
    ticker: company?.ticker ?? COMPANY_PROFILE.ticker,
    headquarters: company?.headquarters ?? COMPANY_PROFILE.headquarters,
    fiscalYear: company?.fiscal_year_label ?? COMPANY_PROFILE.fiscalYear,
    targetScore: company?.enterprise_target_score ?? COMPANY_PROFILE.enterpriseTargetScore,
    minFloor: company?.minimum_composite_floor ?? COMPANY_PROFILE.minimumCompositeFloor,
    boardThreshold: company?.board_risk_threshold ?? COMPANY_PROFILE.boardRiskThreshold,
    auditChair: company?.audit_committee_chair ?? COMPANY_PROFILE.auditCommitteeChair,
    externalAuditor: company?.external_auditor ?? COMPANY_PROFILE.externalAuditor,
    regulatoryScope:
      company?.regulatory_scope && company.regulatory_scope.length > 0
        ? company.regulatory_scope
        : COMPANY_PROFILE.regulatoryScope,
  };

  const handleSaveCharter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (mode === 'demo') {
      setEditOpen(false);
      onNotify('Company Charter preview updated in local Demo Mode.');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiClient.put<CompanyProfileOut>('/company', {
        legal_name: legalName.trim(),
        headquarters: headquarters.trim() || null,
        audit_committee_chair: auditChair.trim() || null,
        external_auditor: externalAuditor.trim() || null,
      });
      setCompany(updated);
      setEditOpen(false);
      onNotify('Updated Company Charter & Governance entity details in PostgreSQL.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.detail : 'Failed to update company profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCharter = () => {
    auditService.exportCsvRows(
      'CompanyAudit_Charter_Scope.csv',
      ['Field', 'Value'],
      [
        ['Legal Entity', profileData.legalName],
        ['Ticker', profileData.ticker],
        ['Headquarters', profileData.headquarters],
        ['Fiscal Period', profileData.fiscalYear],
        ['Enterprise Target Score', `${profileData.targetScore}%`],
        ['Minimum Composite Floor', `${profileData.minFloor}%`],
        ['Board Risk Escalation Cap', String(profileData.boardThreshold)],
        ['Audit Committee Chair', profileData.auditChair],
        ['External Auditor', profileData.externalAuditor],
        ['Regulatory Scope', profileData.regulatoryScope.join(' | ')],
      ]
    );
    onNotify('Downloaded Audit Charter & Regulatory Mandate CSV digest.');
  };

  const displayExecutiveName = user?.full_name || CURRENT_USER.name;
  const displayExecutiveRole = user?.job_title || CURRENT_USER.role;
  const displayCerts = user?.certifications?.length ? user.certifications : CURRENT_USER.certifications;

  if (mode === 'api' && loading && !company) {
    return (
      <div className="flex flex-col gap-8 w-full">
        <PageHeader
          breadcrumbs={[
            { label: 'Enterprise Governance', to: '/dashboard' },
            { label: 'Company Profile & Charter' },
          ]}
          title="Company Profile & Audit Charter"
          description="Loading organization governance profile..."
        />
        <div className="h-72 rounded-xl bg-surface-container-lowest border border-border-hairline animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Enterprise Governance', to: '/dashboard' },
          { label: 'Company Profile & Charter' },
        ]}
        badge={
          <StatusBadge tone="secondary">
            <span className="font-mono">{profileData.ticker}</span>
          </StatusBadge>
        }
        title="Company Profile & Audit Charter"
        description="Corporate entity structure, statutory assurance scope, and internal audit committee charter mandates."
        actions={
          <>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface hover:bg-surface-container-low transition-colors shadow-exec-sm"
              >
                <Edit3 className="w-4 h-4 text-secondary" />
                <span>Edit Charter</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCharter}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-lg text-on-surface hover:bg-surface-container-low transition-colors shadow-exec-sm"
            >
              <FileCheck2 className="w-4 h-4 text-secondary" />
              <span>Export Audit Charter</span>
            </button>
          </>
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-error-container text-on-error-container border border-error/25 flex items-center gap-2.5 text-body-sm">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Top Entity Summary Card */}
      <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-surface-container">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-headline-lg font-bold text-primary">{profileData.legalName}</h2>
                <StatusBadge tone="info">
                  <span className="font-mono">{profileData.ticker}</span>
                </StatusBadge>
                <StatusBadge tone="success">Active Charter</StatusBadge>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-1.5 flex items-center gap-2">
                <Globe className="w-4 h-4 text-secondary shrink-0" />
                <span>{profileData.headquarters}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5 bg-surface-container-low/80 rounded-xl p-4 border border-border-hairline/70">
            <div>
              <span className="text-label-sm uppercase tracking-wider text-outline block">Fiscal Period</span>
              <span className="text-headline-sm font-bold text-primary tabular-nums mt-0.5 block">
                {profileData.fiscalYear}
              </span>
            </div>
            <div>
              <span className="text-label-sm uppercase tracking-wider text-outline block">Target Score</span>
              <span className="font-mono text-headline-sm font-bold text-secondary tabular-nums mt-0.5 block">
                {profileData.targetScore.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-label-sm uppercase tracking-wider text-outline block">Min Floor</span>
              <span className="font-mono text-headline-sm font-bold text-primary tabular-nums mt-0.5 block">
                {profileData.minFloor.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Governance Leadership Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-6">
          <div className="p-5 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
            <div className="flex items-center gap-2 text-label-sm text-outline uppercase tracking-wider mb-2">
              <Landmark className="w-4 h-4 text-secondary" />
              <span>Audit Committee Chair</span>
            </div>
            <p className="text-headline-sm font-bold text-primary">{profileData.auditChair}</p>
            <p className="text-body-sm text-on-surface-variant mt-1.5 leading-relaxed">
              Direct functional reporting line per IIA Standards &amp; NYSE Listed Company Manual.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
            <div className="flex items-center gap-2 text-label-sm text-outline uppercase tracking-wider mb-2">
              <Scale className="w-4 h-4 text-secondary" />
              <span>Statutory External Auditor</span>
            </div>
            <p className="text-headline-sm font-bold text-primary">{profileData.externalAuditor}</p>
            <p className="text-body-sm text-on-surface-variant mt-1.5 leading-relaxed">
              Coordinated reliance testing for SOX 404(b) ICFR &amp; annual consolidated financial statements.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container-low/70 border border-border-hairline/70">
            <div className="flex items-center gap-2 text-label-sm text-outline uppercase tracking-wider mb-2">
              <UserCheck className="w-4 h-4 text-secondary" />
              <span>Signed-In Governance Principal</span>
            </div>
            <p className="text-headline-sm font-bold text-primary">
              {displayExecutiveName} — {displayExecutiveRole}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {displayCerts.map((cert) => (
                <StatusBadge key={cert} tone="neutral">
                  <span className="font-mono">{cert}</span>
                </StatusBadge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Regulatory Scope & Assurance Mandates */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-headline-lg text-primary">Active Regulatory &amp; Assurance Frameworks</h3>
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                Mandatory compliance regimes mapped across all enterprise departments.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-secondary shrink-0" />
          </div>

          <div className="space-y-3">
            {profileData.regulatoryScope.map((framework, idx) => (
              <div
                key={framework}
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low/70 border border-border-hairline/60"
              >
                <div className="flex items-center gap-3.5">
                  <span className="w-8 h-8 rounded-lg bg-secondary-fixed text-secondary font-mono text-label-md font-bold flex items-center justify-center shrink-0">
                    0{idx + 1}
                  </span>
                  <div>
                    <p className="text-headline-sm font-bold text-on-surface">{framework}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      Continuous control monitoring &amp; quarterly attestation enabled
                    </p>
                  </div>
                </div>
                <StatusBadge tone="success">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>In Scope</span>
                </StatusBadge>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-headline-lg text-primary">Board Escalation &amp; Independence Safeguards</h3>
                <p className="text-body-sm text-on-surface-variant mt-0.5">Charter-enforced governance guardrails</p>
              </div>
              <Award className="w-5 h-5 text-secondary shrink-0" />
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface-container-low/80 border border-border-hairline/60">
                <span className="text-headline-sm font-bold text-primary block mb-1">
                  1. Automatic Audit Committee Escalation
                </span>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  Any inherent risk scored at or above{' '}
                  <span className="font-mono font-bold text-error">≥ 17 (Critical)</span> or enterprise critical/high risk count
                  exceeding{' '}
                  <span className="font-mono font-bold text-primary">
                    {profileData.boardThreshold} Items
                  </span>{' '}
                  triggers mandatory 48-hour Board notification.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low/80 border border-border-hairline/60">
                <span className="text-headline-sm font-bold text-primary block mb-1">
                  2. Unrestricted Operational Access
                </span>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  Internal Audit maintains full read-only access to ERP ledgers, cloud IAM configurations, HRIS equity
                  logs, and vendor sub-processor registries.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low/80 border border-border-hairline/60">
                <span className="text-headline-sm font-bold text-primary block mb-1">
                  3. Cryptographic SHA-256 Evidence Verification
                </span>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  All workpapers and control artifacts are hashed with SHA-256 upon upload, tracked inside an
                  append-only audit history ledger, and verified on every retrieval.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Charter Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-primary/40 backdrop-blur-[2px]" onClick={() => setEditOpen(false)} />
          <form
            onSubmit={handleSaveCharter}
            className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-10"
          >
            <div className="px-6 py-4 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
              <h2 className="text-headline-lg text-primary">Edit Corporate Charter Metadata</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Legal Entity Name</label>
                <input
                  type="text"
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Headquarters</label>
                <input
                  type="text"
                  value={headquarters}
                  onChange={(e) => setHeadquarters(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">Audit Committee Chair</label>
                <input
                  type="text"
                  value={auditChair}
                  onChange={(e) => setAuditChair(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
              <div>
                <label className="block text-label-md uppercase text-on-surface-variant mb-1.5">External Auditor</label>
                <input
                  type="text"
                  value={externalAuditor}
                  onChange={(e) => setExternalAuditor(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-border-hairline text-body-md focus:outline-none focus:border-secondary"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-border-hairline flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="h-10 px-4 rounded-lg border border-border-hairline bg-surface-container-lowest text-label-lg text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Charter'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
