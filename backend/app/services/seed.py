import hashlib
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.audit import Audit, AuditResponse, AuditScope, Checklist, ChecklistItem
from app.models.core import Company, Department, User
from app.models.domains import Customer, Employee, FinancialMetric, Project, ProjectTask
from app.models.governance import CorrectiveAction, DistributionRule, Evidence, Finding, Recommendation, Risk
from app.models.telemetry import Notification
from app.services.audit_history import record_audit_history
from app.services.scoring import classify_risk_severity, recalculate_audit_score


def _month_anchor(ref_dt: datetime, months_back: int) -> datetime:
    """Returns a deterministic UTC datetime `months_back` calendar months prior."""
    year = ref_dt.year
    month = ref_dt.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    day = min(15, ref_dt.day if months_back == 0 else 15)
    return datetime(year, month, day, 14, 0, 0, tzinfo=UTC)


def seed_database(
    db: Session,
    *,
    account_password: str | None = None,
) -> dict[str, int | str]:
    """
    Idempotently seeds a realistic enterprise audit organization covering all 20 tables
    and all 5 RBAC roles. Reads password from parameter or DEMO_ACCOUNT_PASSWORD env.
    """
    existing = db.scalar(
        select(Company).where(Company.legal_name == "Audit Systems Group, Inc. (Global Holdings)")
    )
    if existing is not None:
        return {"status": "already_seeded", "company_id": str(existing.id)}

    settings = get_settings()
    raw_password = account_password or settings.demo_account_password
    if not raw_password:
        raise RuntimeError(
            "Seed password not configured. Set DEMO_ACCOUNT_PASSWORD in backend/.env or pass account_password."
        )

    today = datetime.now(UTC).date()
    pwd_hash = hash_password(raw_password)

    # 1. Company
    company = Company(
        legal_name="Audit Systems Group, Inc. (Global Holdings)",
        ticker="NYSE: ASGI",
        headquarters="New York, NY — Global Operations across 14 Jurisdictions",
        fiscal_year_label="FY 2025 (Q4 Active)",
        audit_committee_chair="Hon. Margaret Sterling (Independent Director)",
        external_auditor="Deloitte & Touche LLP (Statutory Assurance)",
        regulatory_scope=[
            "SOX 404(b)",
            "SOC 2 Type II",
            "ISO/IEC 27001:2022",
            "GDPR / CCPA Art. 30",
            "NIST CSF 2.0",
        ],
        enterprise_target_score=85.00,
        minimum_composite_floor=80.00,
        board_risk_threshold=5,
        digest_frequency="Weekly — Mondays 08:00 EST",
        sla_auto_escalate=True,
        ai_citation_strict=True,
        is_active=True,
    )
    db.add(company)
    db.flush()

    # 2. Departments (weights sum cleanly to 1.0000)
    dept_specs = [
        ("FIN-01", "Finance & Treasury", 85.0, 0.15, None),
        ("HRE-02", "Human Resources & Equity", 85.0, 0.10, None),
        ("COP-03", "Customer Operations & Support", 85.0, 0.125, None),
        (
            "ITS-04",
            "Information Technology & SecOps",
            85.0,
            0.175,
            "Active findings awaiting multi-cloud IAM certification. Scheduled for Q4 review.",
        ),
        ("OPS-05", "Supply Chain & Physical Operations", 85.0, 0.125, None),
        ("PMO-06", "Enterprise PMO & Capital Projects", 85.0, 0.125, None),
        ("LGL-07", "Legal, Privacy & Regulatory Affairs", 85.0, 0.10, None),
        ("PRC-08", "Global Procurement & Vendor Risk", 85.0, 0.10, None),
    ]
    departments: dict[str, Department] = {}
    for code, name, target, weight, note in dept_specs:
        dept = Department(
            company_id=company.id,
            code=code,
            name=name,
            target_score=target,
            scoring_weight=weight,
            attention_note=note,
        )
        db.add(dept)
        departments[code] = dept
    db.flush()

    # 3. Users covering ALL 5 RBAC roles
    user_specs = [
        (
            "eleanor.vance@companyaudit.io",
            "Eleanor Vance",
            "Chief Audit Officer",
            "Admin",
            None,
            ["CPA", "CIA", "CISA", "CRISC"],
        ),
        (
            "marcus.chen@companyaudit.io",
            "Marcus Chen",
            "Principal Financial & Cloud Auditor",
            "Auditor",
            None,
            ["CPA", "CISA"],
        ),
        (
            "lisa.patel@companyaudit.io",
            "Lisa Patel",
            "People & Governance Auditor",
            "Auditor",
            None,
            ["CIA", "SHRM-SCP"],
        ),
        (
            "marcus.kane@companyaudit.io",
            "Marcus Kane",
            "VP SecOps",
            "Department Head",
            departments["ITS-04"].id,
            ["CISSP", "CISM"],
        ),
        (
            "sarah.jenkins@companyaudit.io",
            "Sarah Jenkins",
            "VP Customer Operations",
            "Department Head",
            departments["COP-03"].id,
            ["CIPP/E"],
        ),
        (
            "rachel.lee@companyaudit.io",
            "Rachel Lee",
            "Director of Infrastructure & Operations",
            "Department Head",
            departments["OPS-05"].id,
            ["PMP"],
        ),
        (
            "elena.rostova@companyaudit.io",
            "Elena Rostova",
            "VP Human Resources",
            "Department Head",
            departments["HRE-02"].id,
            ["SPHR"],
        ),
        (
            "astrid.lindholm@companyaudit.io",
            "Astrid Lindholm",
            "Chief Privacy Counsel",
            "Department Head",
            departments["LGL-07"].id,
            ["CIPP/US", "JD"],
        ),
        (
            "jonathan.mercer@companyaudit.io",
            "Jonathan Mercer",
            "VP Enterprise PMO",
            "Department Head",
            departments["PMO-06"].id,
            ["PMP", "COBIT"],
        ),
        (
            "david.ross@companyaudit.io",
            "David Ross",
            "VP Global Procurement",
            "Department Head",
            departments["PRC-08"].id,
            ["CPSM"],
        ),
        (
            "david.sterling@companyaudit.io",
            "David Sterling",
            "Corporate Treasurer & EVP Finance",
            "Management",
            departments["FIN-01"].id,
            ["CPA", "CFA"],
        ),
        (
            "viewer@companyaudit.io",
            "Margaret Sterling",
            "Board Audit Committee Observer",
            "Viewer",
            None,
            ["NACD"],
        ),
    ]
    users: dict[str, User] = {}
    for email, full_name, job_title, role, dept_id, certs in user_specs:
        user = User(
            company_id=company.id,
            department_id=dept_id,
            email=email,
            password_hash=pwd_hash,
            full_name=full_name,
            job_title=job_title,
            role=role,
            certifications=certs,
            is_active=True,
        )
        db.add(user)
        users[email] = user
    db.flush()

    # Bind department heads back cleanly
    head_bindings = {
        "FIN-01": "david.sterling@companyaudit.io",
        "HRE-02": "elena.rostova@companyaudit.io",
        "COP-03": "sarah.jenkins@companyaudit.io",
        "ITS-04": "marcus.kane@companyaudit.io",
        "OPS-05": "rachel.lee@companyaudit.io",
        "PMO-06": "jonathan.mercer@companyaudit.io",
        "LGL-07": "astrid.lindholm@companyaudit.io",
        "PRC-08": "david.ross@companyaudit.io",
    }
    for d_code, u_email in head_bindings.items():
        departments[d_code].head_user_id = users[u_email].id
    db.flush()

    # 4. Checklists & Checklist Items
    checklist_specs = [
        (
            "CHK-TECH-2025",
            "Technology Infrastructure & IAM Controls",
            "Technology",
            "SOC 2 Type II / ISO 27001",
            [
                (
                    "CC6.1-IAM",
                    "Privileged Production Identity & MFA Enforcement",
                    "Inspect AWS Organizations & Entra ID role bindings for standing admin privileges and hardware MFA.",
                    2.0,
                ),
                (
                    "CC6.7-KMS",
                    "Automated Cryptographic Key Rotation (90-Day Policy)",
                    "Verify AWS KMS & Secrets Manager rotation schedules across all production service accounts.",
                    1.5,
                ),
                (
                    "CC6.8-BAK",
                    "Production Backup Encryption & Recovery Testing",
                    "Verify KMS CMK encryption enforcement on EBS/RDS snapshots and quarterly restore drills.",
                    1.0,
                ),
            ],
        ),
        (
            "CHK-FIN-2025",
            "SOX 404 Internal Financial Controls",
            "Financial",
            "SOX 404 Subpart B",
            [
                (
                    "SOX-FIN-04",
                    "Dual-Custody Wire Release & Vendor Bank Master Change Control",
                    "Sample 25 disbursements >$250k and test SAP GRC preventive SoD enforcement.",
                    2.0,
                ),
                (
                    "SOX-REV-02",
                    "Quarterly Revenue Cutoff & Multi-Element Contract Allocation",
                    "Reconcile Q3/Q4 enterprise SaaS contract schedules against GL deferred revenue balances.",
                    2.0,
                ),
            ],
        ),
        (
            "CHK-HR-2025",
            "Human Resources & Security Awareness Controls",
            "HR",
            "Labor Standards & SOC 2 CC1.4",
            [
                (
                    "HR-CMP-01",
                    "Pre-Employment Background Screening & Security Onboarding",
                    "Verify 100% completion of background checks prior to credential issuance for Q4 hires.",
                    1.5,
                ),
                (
                    "HR-LMS-02",
                    "Annual Information Security Training & NDA Attestation",
                    "Verify LMS completion logs and overdue escalation workflows.",
                    1.0,
                ),
            ],
        ),
        (
            "CHK-CUST-2025",
            "Customer Data Protection & GDPR Controls",
            "Customer",
            "GDPR / CCPA Art. 30",
            [
                (
                    "GDPR-30-A",
                    "Customer DSAR Erasure & Data Residency Synchronization",
                    "Test automated deletion propagation from Customer Data Platform to downstream analytics stores.",
                    1.5,
                ),
                (
                    "GDPR-32-B",
                    "DPA Counter-Signature & Encryption in Transit",
                    "Verify TLS 1.3 and active Data Processing Addendums across active enterprise accounts.",
                    1.0,
                ),
            ],
        ),
        (
            "CHK-PROJ-2025",
            "Capital Project Stage-Gate Governance",
            "Project",
            "PMI / COBIT 2019 BAI",
            [
                (
                    "PMO-CAP-03",
                    "Capital Expenditure Stage-Gate & Change Order Authorization",
                    "Inspect steering committee approvals for variance requests exceeding 5% baseline.",
                    1.5,
                ),
                (
                    "PMO-MIG-04",
                    "Data Migration Reconciliation Sign-Off",
                    "Verify ledger parity between legacy ERP and cloud S/4HANA staging target.",
                    1.5,
                ),
            ],
        ),
        (
            "CHK-OPS-2025",
            "Supply Chain, Vendor Risk & EHS Controls",
            "Operations",
            "ISO 22301 / TPRM",
            [
                (
                    "OPS-EHS-07",
                    "Critical Facility Environmental Telemetry & Supplier Failover",
                    "Verify redundant OEM hardware SLA readiness and sensor calibration logs.",
                    1.0,
                ),
                (
                    "OPS-TPRM-02",
                    "Tier-1 Vendor SOC 2 Type II Annual Attestation",
                    "Inspect bridge letters and annual SOC 2 reports for top 15 operational sub-processors.",
                    1.5,
                ),
            ],
        ),
        (
            "CHK-COMP-2025",
            "Statutory & Regulatory Registry Compliance",
            "Compliance",
            "ISO 27701 / GDPR",
            [
                (
                    "LGL-REG-01",
                    "Record of Processing Activities (RoPA) & SCC Synchronization",
                    "Validate international transfer SCC clauses across regional cloud telemetry streams.",
                    2.0,
                ),
            ],
        ),
    ]

    checklists: dict[str, Checklist] = {}
    items_by_code: dict[str, ChecklistItem] = {}
    for c_code, title, domain, fw, item_list in checklist_specs:
        chk = Checklist(
            company_id=company.id,
            code=c_code,
            title=title,
            domain=domain,
            framework=fw,
            version="2025.4",
            is_active=True,
        )
        db.add(chk)
        db.flush()
        checklists[c_code] = chk
        for idx, (ctrl_code, item_title, proc, weight) in enumerate(item_list, start=1):
            ci = ChecklistItem(
                company_id=company.id,
                checklist_id=chk.id,
                control_code=ctrl_code,
                title=item_title,
                test_procedure=proc,
                weight=weight,
                display_order=idx,
            )
            db.add(ci)
            db.flush()
            items_by_code[ctrl_code] = ci

    # 5. Audits + Audit Scopes
    audit_specs = [
        (
            "AUD-2025-094",
            "Q4 Technology & Infrastructure",
            "Technology",
            "SOC 2 Type II / ISO 27001",
            "ITS-04",
            "eleanor.vance@companyaudit.io",
            "In Progress",
            today - timedelta(days=20),
            today + timedelta(days=14),
            None,
            "Comprehensive inspection of hybrid multicloud access governance, key rotation architecture, and SOC incident telemetry pipelines.",
        ),
        (
            "AUD-2025-081",
            "Annual Financial Internal Controls",
            "Financial",
            "SOX 404 Subpart B",
            "FIN-01",
            "marcus.chen@companyaudit.io",
            "In Progress",
            today - timedelta(days=28),
            today + timedelta(days=24),
            None,
            "End-to-end ICFR walkthrough covering revenue recognition ASC 606 cutoffs, ERP segregation of duties, and treasury wire controls.",
        ),
        (
            "AUD-2025-072",
            "Global Privacy & GDPR Review",
            "Customer",
            "GDPR / CCPA Art. 30",
            "COP-03",
            "marcus.chen@companyaudit.io",
            "Review",
            today - timedelta(days=35),
            today + timedelta(days=8),
            None,
            "Verification of customer DSAR fulfillment SLAs, cross-border SCC clauses, consent ledger integrity, and retention purging.",
        ),
        (
            "AUD-2025-103",
            "Vendor Security Assessment",
            "Operations",
            "Third-Party Risk (TPRM)",
            "OPS-05",
            "marcus.chen@companyaudit.io",
            "Scheduled",
            today + timedelta(days=5),
            today + timedelta(days=35),
            None,
            "Tier-1 supplier resilience, sub-processor SOC 2 attestation review, and hardware supply chain continuity audit.",
        ),
        (
            "AUD-2025-062",
            "HR Operational Compliance",
            "HR",
            "Labor Standards & OSHA",
            "HRE-02",
            "lisa.patel@companyaudit.io",
            "Closed",
            today - timedelta(days=60),
            today - timedelta(days=18),
            datetime.now(UTC) - timedelta(days=18),
            "Audit of background screening completeness, executive compensation governance, mandatory security training, and OSHA logs.",
        ),
        (
            "AUD-2025-099",
            "ERP Cloud Migration Capital Project",
            "Project",
            "PMI / COBIT 2019 BAI",
            "PMO-06",
            "marcus.chen@companyaudit.io",
            "In Progress",
            today - timedelta(days=15),
            today + timedelta(days=33),
            None,
            "Stage-gate capital budget governance, data migration reconciliation controls, and vendor milestone sign-off verification.",
        ),
        (
            "AUD-2025-108",
            "Cross-Border Transfer & Vendor Assurance",
            "Compliance",
            "GDPR Art. 46 / ISO 27701",
            "LGL-07",
            "eleanor.vance@companyaudit.io",
            "Action Required",
            today - timedelta(days=25),
            today + timedelta(days=19),
            None,
            "Statutory inspection of APAC vendor sub-processor SCC clauses and edge PII tokenization rollout.",
        ),
    ]

    audits: dict[str, Audit] = {}
    for (
        code,
        title,
        domain,
        fw,
        dept_code,
        lead_email,
        st,
        start_dt,
        due_dt,
        comp_at,
        summary,
    ) in audit_specs:
        audit = Audit(
            company_id=company.id,
            department_id=departments[dept_code].id,
            lead_auditor_id=users[lead_email].id,
            created_by_id=users["eleanor.vance@companyaudit.io"].id,
            code=code,
            title=title,
            domain=domain,
            framework=fw,
            status=st,
            scheduled_start=start_dt,
            target_due_date=due_dt,
            completed_at=comp_at,
            summary=summary,
        )
        db.add(audit)
        audits[code] = audit
    db.flush()

    # Scopes
    scope_rows = [
        ("AUD-2025-094", "Production AWS IAM & KMS", "AWS Organizations US-East/EU-Central", "SOC 2 CC6.1 / CC6.7"),
        ("AUD-2025-094", "Kubernetes Ingestion Gateway", "EKS Cluster Ingest-01..08", "ISO 27001 A.12.6.1"),
        ("AUD-2025-081", "Treasury Wire Controls", "SAP S/4HANA AP Disbursements", "SOX 404 ICFR-04"),
        ("AUD-2025-081", "Revenue Recognition Cutoff", "ASC 606 Deferred Revenue Sub-Ledger", "SOX 404 ASC 606"),
        ("AUD-2025-072", "Customer DSAR Pipeline", "Global Consent & DSAR Portal", "GDPR Art. 17 / Art. 30"),
        ("AUD-2025-062", "Employee Background & LMS", "Workday HCM & LMS Webhook", "SOC 2 CC1.4"),
        ("AUD-2025-099", "ERP Cutover Stage-Gates", "Finance Transformation PMO", "COBIT BAI01"),
        ("AUD-2025-103", "Tier-1 OEM & Cloud Vendors", "Global Procurement AVL", "ISO 22301 8.3"),
        ("AUD-2025-108", "APAC Transfer Safeguards", "APAC Telemetry Pipelines", "GDPR Art. 46"),
    ]
    for a_code, s_name, sys_proc, clause in scope_rows:
        db.add(
            AuditScope(
                company_id=company.id,
                audit_id=audits[a_code].id,
                scope_name=s_name,
                system_or_process=sys_proc,
                regulatory_clause=clause,
                in_scope=True,
            )
        )

    # 6. Audit Responses (weighted checklist testing -> chronological monthly DB calculation)
    now_utc = datetime.now(UTC)
    response_rows = [
        # Month -2 (~66.67% baseline wave)
        ("AUD-2025-081", "SOX-FIN-04", "marcus.chen@companyaudit.io", "Partial", 0.50, "Emergency role restricted; automated GRC transport awaiting cutover.", 2),
        ("AUD-2025-072", "GDPR-32-B", "marcus.chen@companyaudit.io", "Partial", 0.50, "2 regional mid-market DPAs awaiting final countersignature.", 2),
        ("AUD-2025-062", "HR-CMP-01", "lisa.patel@companyaudit.io", "Pass", 1.00, "All Q4 hires verified prior to Active Directory provisioning.", 2),
        # Month -1 (~78.13% mid-cycle remediation wave)
        ("AUD-2025-081", "SOX-REV-02", "marcus.chen@companyaudit.io", "Pass", 1.00, "100% ASC 606 cutoff sample reconciled without exceptions.", 1),
        ("AUD-2025-072", "GDPR-30-A", "marcus.chen@companyaudit.io", "Pass", 1.00, "DSAR deletion SLA averages 11 days vs 30-day statutory cap.", 1),
        ("AUD-2025-062", "HR-LMS-02", "lisa.patel@companyaudit.io", "Pass", 1.00, "LMS webhook remediation verified at 99.4% completion.", 1),
        ("AUD-2025-099", "PMO-MIG-04", "marcus.chen@companyaudit.io", "Partial", 0.50, "2 sub-ledger currency rounding tolerances under review.", 1),
        ("AUD-2025-108", "LGL-REG-01", "eleanor.vance@companyaudit.io", "Partial", 0.50, "11 of 18 APAC vendor SCC addendums signed.", 1),
        # Month 0 (~83.33% current readiness wave)
        ("AUD-2025-094", "CC6.1-IAM", "eleanor.vance@companyaudit.io", "Partial", 0.50, "Standing prod admins reduced; JIT MFA enforcement in final testing.", 0),
        ("AUD-2025-094", "CC6.7-KMS", "marcus.chen@companyaudit.io", "Pass", 1.00, "Secrets Manager rotation restored after daemon alert fix.", 0),
        ("AUD-2025-094", "CC6.8-BAK", "marcus.chen@companyaudit.io", "Pass", 1.00, "Default KMS EBS encryption verified in US-East production.", 0),
        ("AUD-2025-099", "PMO-CAP-03", "marcus.chen@companyaudit.io", "Pass", 1.00, "Stage-gate approvals intact for Phase 2 ERP wave.", 0),
    ]
    responses_by_key: dict[tuple[str, str], AuditResponse] = {}
    for a_code, ctrl_code, u_email, val, factor, notes, months_back in response_rows:
        resp = AuditResponse(
            company_id=company.id,
            audit_id=audits[a_code].id,
            checklist_item_id=items_by_code[ctrl_code].id,
            responder_user_id=users[u_email].id,
            response_value=val,
            score_factor=factor,
            auditor_notes=notes,
            tested_at=_month_anchor(now_utc, months_back) if months_back > 0 else now_utc,
        )
        db.add(resp)
        responses_by_key[(a_code, ctrl_code)] = resp
    db.flush()

    for audit in audits.values():
        recalculate_audit_score(db, audit)
    db.flush()

    # 7. Risks (5 Enterprise Risks matching matrix + boundaries)
    risk_specs = [
        (
            "RSK-04",
            "Zero-Day Vulnerability in Cloud Ingestion",
            "Unpatched microservices pipeline in US-East gateway exposing unauthenticated endpoint.",
            "Technology",
            5,
            4,
            2,
            3,
            "Mandatory WAF zero-trust perimeter deployment; active patch sprint in canary.",
            "Telemetry pipelines ingested via legacy API gateways permit perimeter bypass under burst load.",
            [
                "AWS US-East Kubernetes Cluster (Ingest-01..08)",
                "Customer Data Transit Pipeline (Kafka Broker Pool)",
                "Public Facing Gateway: api.company.internal/v2/stream",
            ],
            [
                {"code": "SOC 2 CC6.6", "name": "Boundary Protection", "description": "Logical perimeters prevent unauthorized ingress access."},
                {"code": "ISO 27001 A.12.6.1", "name": "Vulnerability Management", "description": "Timely patching within verified SLA thresholds."},
            ],
            "Board Audit Committee",
            today + timedelta(days=12),
            "Under Treatment",
            departments["ITS-04"].id,
            users["marcus.kane@companyaudit.io"].id,
            audits["AUD-2025-094"].id,
        ),
        (
            "RSK-12",
            "Cross-Border Data Transfer Regulatory Non-Alignment",
            "Inadequate Standard Contractual Clauses (SCCs) for APAC vendor telemetry pipelines.",
            "Compliance",
            5,
            5,
            2,
            4,
            "Re-negotiating 18 major vendor DPAs; legal review scheduled for board committee.",
            "Statutory revisions require enforceable audit rights and binding residency guarantees in Singapore and Tokyo.",
            ["APAC Telemetry Ingestion Cluster", "18 Sub-processor DPAs", "GDPR Article 30 RoPA"],
            [
                {"code": "GDPR Art. 46", "name": "Appropriate Safeguards", "description": "Binding safeguards for international personal data transfers."},
                {"code": "ISO 27701 7.5.2", "name": "International Transfers", "description": "Documented audit trail for cross-border PII flows."},
            ],
            "Risk & Compliance Committee",
            today + timedelta(days=5),
            "Open",
            departments["LGL-07"].id,
            users["astrid.lindholm@companyaudit.io"].id,
            audits["AUD-2025-108"].id,
        ),
        (
            "RSK-19",
            "Forex Hedging Exposure in EMEA Subsidiaries",
            "Rapid currency fluctuation exceeding standard 4% sensitivity bands in quarterly forecast.",
            "Financial",
            4,
            3,
            2,
            2,
            "Executing forward derivative contracts across 4 primary billing jurisdictions.",
            "Unhedged EUR/GBP streams exceeded quarterly tolerance corridors prior to forward tranche execution.",
            ["EMEA Treasury Sub-Ledger", "SAP S/4HANA FX Module"],
            [
                {"code": "SOX 404 ICFR-09", "name": "Treasury Controls", "description": "Dual authorization and mark-to-market reconciliation."},
                {"code": "ASC 815", "name": "Derivatives & Hedging", "description": "Formal quarterly effectiveness testing."},
            ],
            "CFO & Audit Committee",
            today + timedelta(days=10),
            "Under Treatment",
            departments["FIN-01"].id,
            users["david.sterling@companyaudit.io"].id,
            audits["AUD-2025-081"].id,
        ),
        (
            "RSK-27",
            "Single Tier-1 Primary Hardware Supplier Dependency",
            "Supply chain single-point-of-failure for datacenter server clusters.",
            "Operations",
            3,
            3,
            1,
            3,
            "Secondary hardware master services agreement countersigned and onboarded.",
            "Concentrated hardware procurement posed 6-week shipping disruption exposure prior to secondary qualification.",
            ["US-East & EU-Central Bare-Metal Clusters", "Approved Vendor List"],
            [
                {"code": "ISO 22301 8.3", "name": "Business Continuity", "description": "Diversified supplier capacity for critical compute recovery."},
            ],
            "VP Operations",
            today + timedelta(days=29),
            "Mitigated",
            departments["OPS-05"].id,
            users["rachel.lee@companyaudit.io"].id,
            audits["AUD-2025-103"].id,
        ),
        (
            "RSK-35",
            "Privileged Access Sprawl in Production Tenants",
            "Excess standing global admin accounts identified during quarterly identity audit.",
            "Technology",
            4,
            5,
            1,
            4,
            "Just-In-Time (JIT) PAM enrollment enforcement and mandatory 4-hour elevation timeout.",
            "Standing admin privileges expanded lateral movement blast radius across staging/prod cloud accounts.",
            ["Production AWS Organizations & Entra ID", "PAM Vault"],
            [
                {"code": "SOC 2 CC6.1", "name": "Logical Access Security", "description": "Least privilege and PAM restriction enforcement."},
            ],
            "Chief Audit Officer",
            today + timedelta(days=6),
            "In Review",
            departments["ITS-04"].id,
            users["marcus.kane@companyaudit.io"].id,
            audits["AUD-2025-094"].id,
        ),
    ]
    risks: dict[str, Risk] = {}
    for (
        r_code,
        title,
        scope_desc,
        cat,
        prob,
        imp,
        res_p,
        res_i,
        mitig,
        narr,
        assets,
        fws,
        esc,
        rev_dt,
        st,
        dept_id,
        owner_id,
        linked_aid,
    ) in risk_specs:
        r = Risk(
            company_id=company.id,
            department_id=dept_id,
            owner_user_id=owner_id,
            linked_audit_id=linked_aid,
            code=r_code,
            title=title,
            scope_description=scope_desc,
            category=cat,
            probability=prob,
            impact=imp,
            severity=classify_risk_severity(prob * imp),
            residual_probability=res_p,
            residual_impact=res_i,
            mitigation_strategy=mitig,
            narrative=narr,
            affected_assets=assets,
            mapped_frameworks=fws,
            escalation_target=esc,
            next_review_date=rev_dt,
            status=st,
        )
        db.add(r)
        risks[r_code] = r
    db.flush()

    # 8. Findings
    finding_specs = [
        (
            "FND-1024",
            "Privileged AWS Production Key Rotation Cycle",
            "The automated CI/CD key rotation daemon failed silently following a container registry credential deprecation without secondary heartbeat telemetry.",
            audits["AUD-2025-094"].id,
            responses_by_key[("AUD-2025-094", "CC6.1-IAM")].id,
            departments["ITS-04"].id,
            users["marcus.kane@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Cloud SecOps Infra",
            "Critical",
            "In Progress",
            today + timedelta(days=4),
            "Manual emergency key rotation executed; automated Secrets Manager Lambda deployment in staging review.",
            None,
            None,
        ),
        (
            "FND-1021",
            "Segregation of Duties Deficiency in AP Wire Approvals >$250k",
            "Emergency vendor onboarding role in SAP ERP inherited both vendor bank master modification and wire release permissions during role consolidation.",
            audits["AUD-2025-081"].id,
            responses_by_key[("AUD-2025-081", "SOX-FIN-04")].id,
            departments["FIN-01"].id,
            users["david.sterling@companyaudit.io"].id,
            users["marcus.chen@companyaudit.io"].id,
            "Treasury & Accounts Payable",
            "Critical",
            "Overdue",
            today - timedelta(days=2),
            "Emergency SAP role restricted immediately; automated GRC preventive SoD rule block queued for weekend transport.",
            None,
            None,
        ),
        (
            "FND-1019",
            "Vendor Risk Attestation Bridge Letter Gaps",
            "Two Tier-1 operational logistics suppliers missed their Q4 SOC 2 bridge letter submission deadline due to vendor portal renewal lag.",
            audits["AUD-2025-103"].id,
            None,
            departments["OPS-05"].id,
            users["rachel.lee@companyaudit.io"].id,
            users["marcus.chen@companyaudit.io"].id,
            "Facilities & Supply Resilience",
            "Medium",
            "In Progress",
            today + timedelta(days=12),
            "Manual verification questionnaires collected; vendor bridge letters scheduled for upload.",
            None,
            None,
        ),
        (
            "FND-1015",
            "APAC Vendor SCC Counter-Signature Gap",
            "Seven APAC telemetry sub-processors remained on legacy Standard Contractual Clauses requiring updated transfer addendum execution.",
            audits["AUD-2025-108"].id,
            responses_by_key[("AUD-2025-108", "LGL-REG-01")].id,
            departments["LGL-07"].id,
            users["astrid.lindholm@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Global Privacy & Statutory Registry",
            "Low",
            "Verification Pending",
            today + timedelta(days=19),
            "11 of 18 counter-signed DPAs filed; remaining 7 submitted for final legal verification.",
            None,
            None,
        ),
        (
            "FND-1011",
            "Unencrypted Backup Snapshot Retention Policy in Legacy Staging",
            "Legacy staging EBS snapshots lacked cost-center tags, causing the nightly KMS encryption Lambda to skip 14 volume snapshots.",
            audits["AUD-2025-094"].id,
            responses_by_key[("AUD-2025-094", "CC6.8-BAK")].id,
            departments["ITS-04"].id,
            users["marcus.kane@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Cloud Storage Governance",
            "High",
            "In Progress",
            today + timedelta(days=9),
            "All 14 staging snapshots re-encrypted with CMK; account-level EBS encryption policy enabled via Terraform.",
            None,
            None,
        ),
    ]
    findings: dict[str, Finding] = {}
    for (
        f_code,
        title,
        root_cause,
        a_id,
        resp_id,
        dept_id,
        owner_id,
        lead_id,
        ws,
        sev,
        st,
        sla_dt,
        mgmt_resp,
        signed_by,
        signed_at,
    ) in finding_specs:
        f = Finding(
            company_id=company.id,
            audit_id=a_id,
            audit_response_id=resp_id,
            department_id=dept_id,
            owner_user_id=owner_id,
            lead_auditor_id=lead_id,
            signed_off_by_id=signed_by,
            code=f_code,
            title=title,
            root_cause=root_cause,
            workstream=ws,
            severity=sev,
            status=st,
            target_sla_date=sla_dt,
            management_response=mgmt_resp,
            signed_off_at=signed_at,
        )
        db.add(f)
        findings[f_code] = f
    db.flush()

    # 9. Recommendations
    rec_1024 = Recommendation(
        company_id=company.id,
        finding_id=findings["FND-1024"].id,
        risk_id=risks["RSK-35"].id,
        author_user_id=users["eleanor.vance@companyaudit.io"].id,
        title="Enforce Automated Secrets Manager Lambda + Heartbeat Monitoring",
        guidance="Replace cron rotation script with AWS Secrets Manager native 30-day key rotation and PagerDuty heartbeat alarm.",
        priority="Critical",
        management_response="Accepted — Lambda rollout PR #481 in staging.",
        accepted_by_management=True,
        accepted_at=datetime.now(UTC) - timedelta(days=3),
    )
    rec_1021 = Recommendation(
        company_id=company.id,
        finding_id=findings["FND-1021"].id,
        risk_id=None,
        author_user_id=users["marcus.chen@companyaudit.io"].id,
        title="Implement SAP GRC Preventive Segregation of Duties Block",
        guidance="Block any role combining bank-master change auth (FK02/XK02) with AP wire payment release (F110).",
        priority="Critical",
        management_response="Accepted — emergency transport pending weekend freeze window.",
        accepted_by_management=True,
        accepted_at=datetime.now(UTC) - timedelta(days=2),
    )
    db.add_all([rec_1024, rec_1021])
    db.flush()

    # 10. Corrective Actions
    action_specs = [
        ("ACT-101", findings["FND-1024"].id, rec_1024.id, risks["RSK-35"].id, users["marcus.kane@companyaudit.io"].id, users["eleanor.vance@companyaudit.io"].id, 1, "Emergency credential manual rotate across prod tenant", "Executed & verified in AWS CloudTrail", "Verified", 100, today - timedelta(days=2), datetime.now(UTC) - timedelta(days=2), datetime.now(UTC) - timedelta(days=1)),
        ("ACT-102", findings["FND-1024"].id, rec_1024.id, risks["RSK-35"].id, users["marcus.kane@companyaudit.io"].id, None, 2, "Deploy AWS Secrets Manager automated rotation Lambda", "PR #481 validated in staging canary", "In Progress", 65, today + timedelta(days=3), None, None),
        ("ACT-103", findings["FND-1024"].id, rec_1024.id, None, users["marcus.kane@companyaudit.io"].id, None, 3, "CAO audit closure & evidence sign-off", "Pending final CloudTrail log verification", "Pending", 0, today + timedelta(days=4), None, None),
        ("ACT-104", findings["FND-1021"].id, rec_1021.id, None, users["david.sterling@companyaudit.io"].id, users["marcus.chen@companyaudit.io"].id, 1, "Restrict SAP emergency role Z_AP_EMERGENCY_REL", "Verified zero unauthorized disbursements", "Verified", 100, today - timedelta(days=5), datetime.now(UTC) - timedelta(days=5), datetime.now(UTC) - timedelta(days=4)),
        ("ACT-105", findings["FND-1021"].id, rec_1021.id, None, users["david.sterling@companyaudit.io"].id, None, 2, "Deploy automated GRC preventive SoD rule block", "Awaiting weekend SAP transport approval window", "In Progress", 80, today - timedelta(days=1), None, None),
        ("ACT-106", findings["FND-1019"].id, None, risks["RSK-27"].id, users["rachel.lee@companyaudit.io"].id, None, 1, "Collect Q4 SOC 2 Type II bridge letters from Tier-1 vendors", "Two vendor compliance teams engaged", "In Progress", 40, today + timedelta(days=10), None, None),
        ("ACT-107", findings["FND-1015"].id, None, risks["RSK-12"].id, users["astrid.lindholm@companyaudit.io"].id, None, 1, "Execute remaining 7 EU/APAC SCC vendor addendums", "Drafts under counterparty final review", "Submitted", 90, today + timedelta(days=14), datetime.now(UTC) - timedelta(days=1), None),
        ("ACT-108", findings["FND-1011"].id, None, risks["RSK-04"].id, users["marcus.kane@companyaudit.io"].id, None, 1, "Enable account-level EBS default KMS encryption via Terraform", "PR #1104 in staging rollout", "In Progress", 55, today + timedelta(days=7), None, None),
    ]
    actions_map: dict[str, CorrectiveAction] = {}
    for (
        a_code,
        f_id,
        rec_id,
        r_id,
        ass_id,
        ver_id,
        step,
        title,
        detail,
        st,
        pct,
        due,
        comp_at,
        ver_at,
    ) in action_specs:
        act = CorrectiveAction(
            company_id=company.id,
            finding_id=f_id,
            recommendation_id=rec_id,
            risk_id=r_id,
            assigned_to_user_id=ass_id,
            verified_by_user_id=ver_id,
            code=a_code,
            step_order=step,
            title=title,
            detail=detail,
            status=st,
            progress_percent=pct,
            due_date=due,
            completed_at=comp_at,
            verified_at=ver_at,
        )
        db.add(act)
        actions_map[a_code] = act
    db.flush()

    # 11. Evidence Vault (actual real local files outside web root with genuine SHA-256 checksums)
    evidence_dir = settings.evidence_root / str(company.id)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    seed_evidence_specs = [
        (
            "EVD-4091",
            "auth_token_audit.log",
            "text/plain",
            "AWS CloudTrail",
            audits["AUD-2025-094"].id,
            findings["FND-1024"].id,
            actions_map["ACT-101"].id,
            items_by_code["CC6.1-IAM"].id,
            users["marcus.chen@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Verified",
            b"2025-11-12T14:22:01Z AWS CloudTrail RotateSecretEvent account=prod-us-east status=SUCCESS\n2025-11-12T14:22:04Z SecretsManager KeyVersionPromoted\n",
        ),
        (
            "EVD-4088",
            "iam_policy_drift.json",
            "application/json",
            "AWS IAM Config",
            audits["AUD-2025-094"].id,
            findings["FND-1024"].id,
            actions_map["ACT-102"].id,
            items_by_code["CC6.1-IAM"].id,
            users["marcus.kane@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Verified",
            b'{"account":"prod-us-east","standing_admins":0,"jit_mfa_enforced":true,"verified_controls":["CC6.1","A.9.2.3"]}\n',
        ),
        (
            "EVD-4084",
            "sap_sod_matrix_q4.csv",
            "text/csv",
            "SOX 404 ICFR",
            audits["AUD-2025-081"].id,
            findings["FND-1021"].id,
            actions_map["ACT-104"].id,
            items_by_code["SOX-FIN-04"].id,
            users["david.sterling@companyaudit.io"].id,
            None,
            "Pending Review",
            b"role_id,conflict_rule,mitigation_status\nZ_AP_EMERGENCY_REL,BANK_MASTER_PLUS_WIRE,Restricted\nZ_GL_CONTROLLER,NONE,Compliant\n",
        ),
        (
            "EVD-4079",
            "gdpr_art30_ropa_snapshot.pdf",
            "application/pdf",
            "GDPR Art. 30",
            audits["AUD-2025-072"].id,
            findings["FND-1015"].id,
            actions_map["ACT-107"].id,
            items_by_code["GDPR-30-A"].id,
            users["astrid.lindholm@companyaudit.io"].id,
            users["eleanor.vance@companyaudit.io"].id,
            "Verified",
            b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n%% CompanyAudit GDPR Art.30 Record Snapshot\n%%EOF\n",
        ),
        (
            "EVD-4072",
            "lms_completion_roster.csv",
            "text/csv",
            "HR Compliance",
            audits["AUD-2025-062"].id,
            None,
            None,
            items_by_code["HR-LMS-02"].id,
            users["elena.rostova@companyaudit.io"].id,
            users["lisa.patel@companyaudit.io"].id,
            "Verified",
            b"department,total_staff,completed_pct\nEngineering,412,99.5\nFinance,84,100.0\n",
        ),
        (
            "EVD-4065",
            "vendor_attestation_log.txt",
            "text/plain",
            "Operations TPRM",
            audits["AUD-2025-103"].id,
            findings["FND-1019"].id,
            actions_map["ACT-106"].id,
            items_by_code["OPS-TPRM-02"].id,
            users["rachel.lee@companyaudit.io"].id,
            None,
            "Flagged",
            b"vendor=ApexCompute; soc2_bridge_letter=PENDING; escalation_note=Awaiting counter-signature\n",
        ),
    ]
    for (
        ev_code,
        orig_name,
        mime,
        tag,
        a_id,
        f_id,
        act_id,
        ci_id,
        up_id,
        rev_id,
        v_status,
        content_bytes,
    ) in seed_evidence_specs:
        sha_hex = hashlib.sha256(content_bytes).hexdigest()
        storage_key = f"{company.id}/{ev_code.lower()}_{orig_name}"
        file_path = (Path(settings.evidence_root) / storage_key).resolve()
        file_path.write_bytes(content_bytes)
        db.add(
            Evidence(
                company_id=company.id,
                audit_id=a_id,
                finding_id=f_id,
                corrective_action_id=act_id,
                checklist_item_id=ci_id,
                uploaded_by_user_id=up_id,
                reviewed_by_user_id=rev_id,
                code=ev_code,
                original_filename=orig_name,
                storage_key=storage_key,
                mime_type=mime,
                byte_size=len(content_bytes),
                sha256_hash=sha_hex,
                verification_status=v_status,
                tag=tag,
                reviewed_at=datetime.now(UTC) - timedelta(days=2) if rev_id else None,
            )
        )

    # 12. Domain Telemetry Tables (Projects, ProjectTasks, Employees, Customers, FinancialMetrics)
    proj = Project(
        company_id=company.id,
        department_id=departments["PMO-06"].id,
        manager_user_id=users["jonathan.mercer@companyaudit.io"].id,
        code="PRJ-ERP-2025",
        name="ERP Cloud Migration & GL Consolidation",
        budget_amount=4250000.00,
        actual_spend=3610000.00,
        status="Active",
        start_date=today - timedelta(days=120),
        target_end_date=today + timedelta(days=45),
    )
    proj_sec = Project(
        company_id=company.id,
        department_id=departments["ITS-04"].id,
        manager_user_id=users["marcus.kane@companyaudit.io"].id,
        code="PRJ-IAM-2025",
        name="Zero-Trust PAM & Hardware MFA Rollout",
        budget_amount=980000.00,
        actual_spend=845000.00,
        status="At Risk",
        start_date=today - timedelta(days=75),
        target_end_date=today + timedelta(days=20),
    )
    db.add_all([proj, proj_sec])
    db.flush()

    db.add_all(
        [
            ProjectTask(company_id=company.id, project_id=proj.id, assignee_user_id=users["jonathan.mercer@companyaudit.io"].id, title="Stage-Gate 2 Steering Sign-Off", stage_gate="Gate 2", status="Done", due_date=today - timedelta(days=14), sla_breached=False),
            ProjectTask(company_id=company.id, project_id=proj.id, assignee_user_id=users["david.sterling@companyaudit.io"].id, title="SAP GL Trial Balance Cutover Dry-Run", stage_gate="Gate 3", status="In Progress", due_date=today + timedelta(days=10), sla_breached=False),
            ProjectTask(company_id=company.id, project_id=proj_sec.id, assignee_user_id=users["marcus.kane@companyaudit.io"].id, title="Eliminate Standing Root IAM Keys", stage_gate="Milestone B", status="Blocked", due_date=today - timedelta(days=1), sla_breached=True),
        ]
    )

    db.add_all(
        [
            Employee(company_id=company.id, department_id=departments["ITS-04"].id, user_id=users["marcus.kane@companyaudit.io"].id, employee_code="EMP-1001", full_name="Marcus Kane", role_title="VP SecOps", background_check_verified=True, security_training_completed=True, training_completed_at=today - timedelta(days=25), employment_status="Active", hired_at=date(2021, 3, 15)),
            Employee(company_id=company.id, department_id=departments["FIN-01"].id, user_id=users["david.sterling@companyaudit.io"].id, employee_code="EMP-1002", full_name="David Sterling", role_title="Corporate Treasurer", background_check_verified=True, security_training_completed=True, training_completed_at=today - timedelta(days=30), employment_status="Active", hired_at=date(2019, 6, 1)),
            Employee(company_id=company.id, department_id=departments["OPS-05"].id, user_id=users["rachel.lee@companyaudit.io"].id, employee_code="EMP-1003", full_name="Rachel Lee", role_title="Director Infrastructure", background_check_verified=True, security_training_completed=True, training_completed_at=today - timedelta(days=18), employment_status="Active", hired_at=date(2022, 1, 10)),
            Employee(company_id=company.id, department_id=departments["ITS-04"].id, user_id=None, employee_code="EMP-1094", full_name="Hannah Abbott", role_title="Cloud Platform Engineer", background_check_verified=True, security_training_completed=False, training_completed_at=None, employment_status="Active", hired_at=today - timedelta(days=15)),
        ]
    )

    db.add_all(
        [
            Customer(company_id=company.id, account_code="CUST-ENT-01", organization_name="Meridian Global Bank", region="EMEA", tier="Strategic", dpa_signed=True, dsar_requests_open=1, sla_compliance_pct=99.4, satisfaction_score=9.4),
            Customer(company_id=company.id, account_code="CUST-ENT-02", organization_name="Pacific Health Systems", region="APAC", tier="Enterprise", dpa_signed=True, dsar_requests_open=2, sla_compliance_pct=97.8, satisfaction_score=9.1),
            Customer(company_id=company.id, account_code="CUST-ENT-03", organization_name="Nordic Logistics AB", region="EMEA", tier="Mid-Market", dpa_signed=False, dsar_requests_open=0, sla_compliance_pct=98.5, satisfaction_score=8.7),
        ]
    )

    db.add_all(
        [
            FinancialMetric(company_id=company.id, department_id=departments["FIN-01"].id, fiscal_period="Q4 2025", metric_code="ICFR-REV-606", metric_name="ASC 606 Revenue Recognized Controls", currency="USD", reported_amount=142800000.00, budget_amount=140000000.00, variance_pct=2.00, sox_control_verified=True),
            FinancialMetric(company_id=company.id, department_id=departments["FIN-01"].id, fiscal_period="Q4 2025", metric_code="AP-WIRE-DUAL", metric_name="Disbursements Exceeding $250k Dual-Custody Coverage", currency="USD", reported_amount=38450000.00, budget_amount=39000000.00, variance_pct=-1.41, sox_control_verified=False),
            FinancialMetric(company_id=company.id, department_id=departments["PMO-06"].id, fiscal_period="Q4 2025", metric_code="CAPEX-ERP-RUN", metric_name="ERP Transformation Capital Spend", currency="USD", reported_amount=3610000.00, budget_amount=4250000.00, variance_pct=-15.05, sox_control_verified=True),
        ]
    )

    # 13. Notifications & Distribution Rules
    db.add_all(
        [
            Notification(
                company_id=company.id,
                user_id=users["eleanor.vance@companyaudit.io"].id,
                title="SLA Breached: FND-1021 AP Wire Segregation of Duties",
                description="Remediation target exceeded by 2 days. Executive escalation active.",
                severity="critical",
                is_read=False,
                entity_type="Finding",
                entity_id=findings["FND-1021"].id,
                target_link="/findings-and-actions",
                dedup_key="seed_notif:fnd_1021",
            ),
            Notification(
                company_id=company.id,
                user_id=users["eleanor.vance@companyaudit.io"].id,
                title="CAO Verification Requested: FND-1015",
                description="Legal & Privacy submitted APAC SCC counter-signatures for closure sign-off.",
                severity="warning",
                is_read=False,
                entity_type="Finding",
                entity_id=findings["FND-1015"].id,
                target_link="/findings-and-actions",
                dedup_key="seed_notif:fnd_1015",
            ),
            Notification(
                company_id=company.id,
                user_id=users["eleanor.vance@companyaudit.io"].id,
                title="Q4 Board Briefing Snapshot SHA-256 Verified",
                description="All active audit schedules synchronized ahead of Audit Committee review.",
                severity="info",
                is_read=False,
                entity_type="Audit",
                entity_id=audits["AUD-2025-094"].id,
                target_link="/reports",
                dedup_key="seed_notif:board_snap",
            ),
            Notification(
                company_id=company.id,
                user_id=users["marcus.kane@companyaudit.io"].id,
                title="Critical SecOps Action Due: ACT-102 Secrets Manager Lambda",
                description="Automated KMS rotation Lambda required before SLA expiry.",
                severity="critical",
                is_read=False,
                entity_type="CorrectiveAction",
                entity_id=actions_map["ACT-102"].id,
                target_link="/findings-and-actions",
                dedup_key="seed_notif:act_102",
            ),
        ]
    )

    db.add_all(
        [
            DistributionRule(
                company_id=company.id,
                created_by_user_id=users["eleanor.vance@companyaudit.io"].id,
                name="Board Audit Committee Quarterly Brief",
                schedule_label="Quarterly — 1st Business Day",
                recipients="board-audit@companyaudit.io, eleanor.vance@companyaudit.io",
                report_suite_id="rep-board",
                export_format="pdf",
                icon="building",
                is_active=True,
                last_run_at=now_utc - timedelta(days=12),
            ),
            DistributionRule(
                company_id=company.id,
                created_by_user_id=users["marcus.chen@companyaudit.io"].id,
                name="Weekly Remediation SLA Digest",
                schedule_label="Weekly — Mondays 08:00 EST",
                recipients="dept-heads@companyaudit.io, marcus.chen@companyaudit.io",
                report_suite_id="rep-sla",
                export_format="xlsx",
                icon="alarm",
                is_active=True,
                last_run_at=now_utc - timedelta(days=3),
            ),
            DistributionRule(
                company_id=company.id,
                created_by_user_id=users["eleanor.vance@companyaudit.io"].id,
                name="Monthly Statutory & Risk Matrix Feed",
                schedule_label="Monthly — Last Friday 18:00 EST",
                recipients="risk-committee@companyaudit.io, deloitte-external@example.com",
                report_suite_id="rep-risk",
                export_format="csv",
                icon="grid",
                is_active=True,
                last_run_at=now_utc - timedelta(days=7),
            ),
        ]
    )

    # 14. Append-Only Hash-Chained Audit History Ledger
    history_specs = [
        (users["marcus.kane@companyaudit.io"], "Control Test", "Risk & Compliance", "Risk", risks["RSK-04"].id, "RSK-04", "Updated mitigation strategy with WAF canary telemetry", {"progress": 68}, now_utc - timedelta(days=6)),
        (users["eleanor.vance@companyaudit.io"], "Sign-Off", "Audit Management", "Audit", audits["AUD-2025-062"].id, "AUD-2025-062", "Completed final sign-off on HR Operational Compliance audit (Score: 100%)", {"status": "Closed"}, now_utc - timedelta(days=4)),
        (None, "Risk Escalation", "Findings & Actions", "Finding", findings["FND-1021"].id, "FND-1021", "Flagged SLA breach on AP Wire Segregation of Duties remediation", {"status": "Overdue"}, now_utc - timedelta(days=2)),
        (users["marcus.chen@companyaudit.io"], "Evidence", "Evidence Management", "Evidence", audits["AUD-2025-094"].id, "EVD-4091", "Uploaded SHA-256 verified CloudTrail rotation audit log", {"filename": "auth_token_audit.log"}, now_utc - timedelta(hours=4)),
    ]
    for actor, cat, mod, e_type, e_id, e_ref, act_txt, chg, ts in history_specs:
        record_audit_history(
            db,
            company_id=company.id,
            actor=actor,
            category=cat,
            module=mod,
            entity_type=e_type,
            entity_id=e_id,
            entity_ref=e_ref,
            action=act_txt,
            changes=chg,
            actor_label_override=actor.full_name if actor else "System SLA Engine",
            actor_role_override=(actor.job_title or actor.role) if actor else "Automated Governance",
            created_at_override=ts,
        )

    db.commit()
    return {
        "status": "seeded",
        "company_id": str(company.id),
        "users": len(users),
        "departments": len(departments),
        "audits": len(audits),
        "findings": len(findings),
        "risks": len(risks),
    }


def main() -> None:
    from app.core.database import SessionLocal

    with SessionLocal() as db:
        result = seed_database(db)
        print(result)


if __name__ == "__main__":
    main()

