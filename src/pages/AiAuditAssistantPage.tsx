import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  FileSearch,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiClient } from '../services/apiClient';
import {
  AiSynthesisResponse,
  DashboardOverviewOut,
  FindingOut,
  PaginatedResponse,
  RiskOut,
} from '../types/api';

interface AiAuditAssistantPageProps {
  onNotify: (msg: string) => void;
}

interface ChatTurn {
  id: string;
  sender: 'assistant' | 'user';
  timestamp: string;
  content: string;
  citations?: { code: string; label: string; link: string }[];
  snapshot?: Record<string, unknown>;
}

const SUGGESTED_PROMPTS = [
  'Summarize top Tier-1 critical risks & SLA breaches for Board briefing',
  'Analyze divisional bottleneck scores and open finding root causes',
  'Summarize SOC 2 Type II & ISO/IEC 27001 readiness and overdue actions',
  'Synthesize SHA-256 verified evidence coverage and Scikit-learn forecast',
];

const DEMO_INITIAL_CONVERSATION: ChatTurn[] = [
  {
    id: 'msg-1',
    sender: 'assistant',
    timestamp: 'Live Session',
    content:
      'Fiduciary Audit Intelligence Engine active (Demo Mode). Indexed sample FY 2025 Q4 audit findings, risk vectors, and statutory compliance frameworks.',
    citations: [
      { code: 'GRC-2025-Q4-EXEC', label: 'Q4 Fiduciary Briefing', link: '/reports' },
      { code: 'AUD-2025-094', label: 'Q4 Tech & Infra Audit', link: '/audits' },
    ],
  },
];

function generateDeterministicAuditReply(prompt: string): {
  content: string;
  citations: { code: string; label: string; link: string }[];
} {
  const lower = prompt.toLowerCase();
  if (lower.includes('secops') || lower.includes('bottleneck') || lower.includes('it')) {
    return {
      content:
        'Information Technology & SecOps scores 76% (below the 80.0% minimum composite floor) due to active multi-cloud IAM certification findings and standing privilege remediation windows.',
      citations: [
        { code: 'FND-1024', label: 'AWS Key Rotation Lapse', link: '/findings-and-actions' },
        { code: 'RSK-04', label: 'Cloud Ingestion Zero-Day', link: '/risk-and-compliance' },
        { code: 'ITS-04', label: 'Departmental Scorecard', link: '/departments' },
      ],
    };
  }
  if (lower.includes('soc 2') || lower.includes('iso') || lower.includes('framework')) {
    return {
      content:
        'Cross-Framework Statutory Posture: SOC 2 Type II leads at 94%, GDPR Article 30 at 92%, ISO/IEC 27001 Stage 2 fieldwork at 88%, and NIST CSF 2.0 at 81% Tier 3.',
      citations: [
        { code: 'SOC 2 CC6.1', label: 'Logical Access Controls', link: '/audits/checklists' },
        { code: 'ISO 27001', label: 'Compliance Posture Matrix', link: '/risk-and-compliance' },
      ],
    };
  }
  return {
    content:
      'Board Executive Synthesis: Critical Risks remain monitored against board tolerance thresholds, with remediation SLA velocity tracked across open findings and SHA-256 verified evidence.',
    citations: [
      { code: 'RSK-12', label: 'Cross-Border Data Risk', link: '/risk-and-compliance' },
      { code: 'FND-1021', label: 'AP Wire SoD Overdue', link: '/findings-and-actions' },
      { code: 'GRC-2025-Q4', label: 'Board Briefing Pack', link: '/reports' },
    ],
  };
}

export const AiAuditAssistantPage: React.FC<AiAuditAssistantPageProps> = ({ onNotify }) => {
  const { mode, user } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>(DEMO_INITIAL_CONVERSATION);
  const [input, setInput] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [sending, setSending] = useState(false);

  // Live context snapshot
  const [dashboard, setDashboard] = useState<DashboardOverviewOut | null>(null);
  const [topFindings, setTopFindings] = useState<FindingOut[]>([]);
  const [topRisks, setTopRisks] = useState<RiskOut[]>([]);

  const loadLiveContext = useCallback(async () => {
    if (mode !== 'api') return;
    try {
      const [dashRes, fndRes, rskRes] = await Promise.all([
        apiClient.get<DashboardOverviewOut>('/dashboard'),
        apiClient.get<PaginatedResponse<FindingOut>>('/findings?limit=3'),
        apiClient.get<PaginatedResponse<RiskOut>>('/risks?limit=3'),
      ]);
      setDashboard(dashRes);
      setTopFindings(fndRes.items);
      setTopRisks(rskRes.items);
      setMessages([
        {
          id: 'api-init-1',
          sender: 'assistant',
          timestamp: 'PostgreSQL Grounded',
          content: `CompanyAudit Intelligence Engine connected to ${dashRes.company_name} (${dashRes.fiscal_year}). Live telemetry indexed: ${dashRes.open_findings_count} open findings, ${dashRes.risk_distribution.total_risks} enterprise risks, and ${dashRes.total_audits_count} audit engagements. Weighted compliance readiness is ${dashRes.composite_score}% (target ${dashRes.enterprise_target}%), Scikit-learn forecast slope ${dashRes.forecast.slope_per_month >= 0 ? '+' : ''}${dashRes.forecast.slope_per_month}%/mo.`,
          citations: [
            { code: 'DASHBOARD', label: 'Executive Telemetry', link: '/dashboard' },
            { code: 'REPORTS', label: 'Governance Briefing Suite', link: '/reports' },
          ],
          snapshot: {
            composite_score: dashRes.composite_score,
            open_findings: dashRes.open_findings_count,
            overdue_findings: dashRes.overdue_findings_count,
            critical_high_risks: dashRes.critical_high_risks_count,
            forecast_next_month: dashRes.forecast.projected_next_month,
          },
        },
      ]);
    } catch {
      // Leave initial message gracefully if context pre-load fails
    }
  }, [mode]);

  useEffect(() => {
    void loadLiveContext();
  }, [loadLiveContext]);

  const sendPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (mode === 'api' && trimmed.length < 3) {
      onNotify('Enter at least 3 characters for grounded synthesis analysis.');
      return;
    }

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatTurn = {
      id: `u-${Date.now()}`,
      sender: 'user',
      timestamp: now,
      content: trimmed,
    };

    if (mode === 'demo') {
      const reply = generateDeterministicAuditReply(trimmed);
      const botMsg: ChatTurn = {
        id: `a-${Date.now() + 1}`,
        sender: 'assistant',
        timestamp: now,
        content: reply.content,
        citations: reply.citations,
      };
      setMessages((prev) => [...prev, userMsg, botMsg]);
      setInput('');
      return;
    }

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const res = await apiClient.post<AiSynthesisResponse>('/reports/ai-synthesis', {
        prompt: trimmed,
        domain: selectedDomain || null,
      });
      const botMsg: ChatTurn = {
        id: `a-${Date.now() + 1}`,
        sender: 'assistant',
        timestamp: new Date(res.generated_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        content: res.answer,
        citations: res.citations.map((c) => ({
          code: c.entity_ref,
          label: c.label,
          link: c.route,
        })),
        snapshot: res.metrics_snapshot,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Grounded synthesis request failed.';
      onNotify(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          timestamp: now,
          content: `Synthesis request error: ${msg}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const userDisplayLabel = user ? `${user.full_name} (${user.role})` : 'Authorized Auditor';

  return (
    <div className="flex flex-col gap-8 w-full">
      <PageHeader
        eyebrow="Grounded Database Intelligence"
        title="AI Audit Assistant"
        description="Query live PostgreSQL audit trails, synthesize control exceptions, and generate assurance narratives grounded in verified evidence."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {mode === 'api' && (
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                aria-label="Filter synthesis domain"
                className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-md text-on-surface"
              >
                <option value="">All Governance Domains</option>
                <option value="Technology">Technology</option>
                <option value="Financial">Financial</option>
                <option value="Compliance">Compliance</option>
                <option value="Operations">Operations</option>
                <option value="HR">HR</option>
              </select>
            )}
            <StatusBadge tone="secondary" dot>
              {mode === 'api' ? 'PostgreSQL + Scikit-learn Grounded' : 'Offline Demo Preview'}
            </StatusBadge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Context & Prompts Rail */}
        <div className="lg:col-span-3 bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-6 space-y-6">
          <div>
            <span className="text-label-sm uppercase tracking-wider text-outline font-bold block mb-3">
              Active Governance Scope
            </span>
            <div className="space-y-2 text-body-sm">
              <div className="flex justify-between px-3 py-2.5 rounded-lg bg-surface-container-low">
                <span className="text-on-surface-variant">Cycle</span>
                <span className="font-mono font-bold text-on-surface">
                  {dashboard?.fiscal_year || 'FY 2025 Q4'}
                </span>
              </div>
              <div className="flex justify-between px-3 py-2.5 rounded-lg bg-surface-container-low">
                <span className="text-on-surface-variant">Open Findings</span>
                <span className="font-mono font-bold text-error">
                  {dashboard ? `${dashboard.open_findings_count} Active` : '18 Active'}
                </span>
              </div>
              <div className="flex justify-between px-3 py-2.5 rounded-lg bg-surface-container-low">
                <span className="text-on-surface-variant">Risk Register</span>
                <span className="font-mono font-bold text-secondary">
                  {dashboard ? `${dashboard.risk_distribution.total_risks} Vectors` : '47 Vectors'}
                </span>
              </div>
              {dashboard && (
                <div className="flex justify-between px-3 py-2.5 rounded-lg bg-surface-container-low">
                  <span className="text-on-surface-variant">Composite Score</span>
                  <span className="font-mono font-bold text-primary">{dashboard.composite_score}%</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <span className="text-label-sm uppercase tracking-wider text-outline font-bold block mb-3">
              Fiduciary Prompt Templates
            </span>
            <div className="space-y-2.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={sending}
                  onClick={() => sendPrompt(p)}
                  className="w-full text-left p-3 rounded-xl bg-surface-container-low/80 border border-border-hairline/60 hover:bg-surface-container disabled:opacity-50 text-body-sm text-on-surface transition-colors leading-snug"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center Interactive Transcript */}
        <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm flex flex-col min-h-[560px]">
          <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-headline-sm text-primary font-bold">CompanyAudit Copilot</div>
                <div className="text-label-sm text-outline">
                  SOX 404 • SOC 2 Type II • ISO 27001 • GDPR Grounded
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (mode === 'api') {
                  void loadLiveContext();
                } else {
                  setMessages(DEMO_INITIAL_CONVERSATION);
                }
                onNotify('Reset AI Audit Assistant conversation thread.');
              }}
              className="text-label-md text-secondary hover:underline"
            >
              Reset Thread
            </button>
          </div>

          <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[460px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 text-label-sm text-outline">
                  <span>{m.sender === 'user' ? userDisplayLabel : 'CompanyAudit AI'}</span>
                  <span className="font-mono">{m.timestamp}</span>
                </div>
                <div
                  className={`max-w-[92%] rounded-xl p-4 text-body-md leading-relaxed whitespace-pre-line ${
                    m.sender === 'user'
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container-low/80 text-on-surface border border-border-hairline/70'
                  }`}
                >
                  {m.content}

                  {m.snapshot && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-border-hairline/60 font-mono text-label-sm text-on-surface-variant">
                      <span>Score: {String(m.snapshot.composite_score ?? '—')}%</span>
                      <span>•</span>
                      <span>Open: {String(m.snapshot.open_findings ?? '—')}</span>
                      <span>•</span>
                      <span>
                        {m.snapshot.evidence_verified_count !== undefined
                          ? `Verified Evidence: ${String(m.snapshot.evidence_verified_count)}`
                          : `Critical/High Risks: ${String(m.snapshot.critical_high_risks ?? '—')}`}
                      </span>
                      <span>•</span>
                      <span>Next Forecast: {String(m.snapshot.forecast_next_month ?? '—')}%</span>
                    </div>
                  )}

                  {m.citations && m.citations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3.5 pt-3 border-t border-border-hairline/60">
                      {m.citations.map((c, idx) => (
                        <Link
                          key={`${c.code}-${idx}`}
                          to={c.link}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-border-hairline text-label-sm text-secondary hover:bg-surface-container transition-colors"
                        >
                          <span className="font-mono font-bold">{c.code}</span>
                          <span className="truncate max-w-[180px]">• {c.label}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendPrompt(input);
            }}
            className="p-4 border-t border-surface-container bg-surface-container-low/40 flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              placeholder="Ask about audit findings, SLA risks, control mappings, or draft summaries..."
              className="flex-1 h-10 px-4 rounded-lg bg-surface-container-lowest border border-border-hairline text-body-md text-on-surface focus:outline-none focus:border-secondary"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Synthesizing...' : 'Analyze'}</span>
            </button>
          </form>
        </div>

        {/* Right Automated Anomaly Telemetry Panel */}
        <div className="lg:col-span-3 bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-secondary" />
            <h3 className="text-headline-sm text-primary font-bold">Continuous Control Anomalies</h3>
          </div>

          {mode === 'api' && (topFindings.length > 0 || topRisks.length > 0) ? (
            <div className="space-y-3 text-body-sm">
              {topFindings.slice(0, 2).map((f) => (
                <Link
                  key={f.id}
                  to="/findings-and-actions"
                  className={`block p-3.5 rounded-xl border space-y-1 transition-colors ${
                    f.is_overdue || f.severity === 'Critical'
                      ? 'bg-error-container/35 border-error-container hover:bg-error-container/50'
                      : 'bg-surface-container-low/80 border-border-hairline/70 hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-label-sm font-bold ${
                        f.is_overdue || f.severity === 'Critical' ? 'text-error' : 'text-secondary'
                      }`}
                    >
                      {f.code} • {f.sla_countdown}
                    </span>
                    <AlertTriangle
                      className={`w-4 h-4 ${
                        f.is_overdue || f.severity === 'Critical' ? 'text-error' : 'text-secondary'
                      }`}
                    />
                  </div>
                  <p className="text-on-surface font-medium line-clamp-2">{f.title}</p>
                </Link>
              ))}

              {topRisks.slice(0, 1).map((r) => (
                <Link
                  key={r.id}
                  to="/risk-and-compliance"
                  className="block p-3.5 rounded-xl bg-surface-container-low/80 border border-border-hairline/70 hover:bg-surface-container space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-label-sm font-bold text-secondary">
                      {r.code} • SCORE {r.inherent_score} ({r.severity})
                    </span>
                    <ShieldAlert className="w-4 h-4 text-secondary" />
                  </div>
                  <p className="text-on-surface font-medium line-clamp-2">{r.title}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-body-sm">
              <div className="p-3.5 rounded-xl bg-error-container/35 border border-error-container space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-label-sm font-bold text-error">FND-1021 • SLA +2d</span>
                  <AlertTriangle className="w-4 h-4 text-error" />
                </div>
                <p className="text-on-surface font-medium">SAP ERP SoD role conflict detected in AP wire &gt;$250k</p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container-low/80 border border-border-hairline/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-label-sm font-bold text-secondary">RSK-04 • SCORE 20</span>
                  <ShieldAlert className="w-4 h-4 text-secondary" />
                </div>
                <p className="text-on-surface font-medium">US-East ingress canary hotfix v2.4.9 queued for 22:00 UTC</p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container-low/80 border border-border-hairline/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-label-sm font-bold text-emerald-700">VERIFIED • 99.4%</span>
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <p className="text-on-surface font-medium">SOC 2 training completion threshold exceeded across HR</p>
              </div>
            </div>
          )}

          <Link
            to="/audits/history"
            className="w-full h-10 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-label-md flex items-center justify-center gap-2 transition-colors"
          >
            <FileSearch className="w-4 h-4 text-secondary" />
            <span>Inspect Full Audit Log</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
