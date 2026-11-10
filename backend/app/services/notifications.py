from datetime import UTC, datetime, timedelta
from typing import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import Audit
from app.models.core import Company, Department, User
from app.models.governance import CorrectiveAction, Finding, Risk
from app.models.telemetry import Notification
from app.services.audit_history import record_audit_history


def create_dedup_notification(
    db: Session,
    *,
    company_id: UUID,
    user_id: UUID | None,
    title: str,
    description: str,
    severity: str = "info",
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    target_link: str | None = "/notifications",
    dedup_key: str | None = None,
) -> Notification | None:
    if user_id is None:
        return None

    if dedup_key:
        for pending in db.new:
            if (
                isinstance(pending, Notification)
                and pending.company_id == company_id
                and pending.user_id == user_id
                and pending.dedup_key == dedup_key
            ):
                return None

        existing_id = db.scalar(
            select(Notification.id).where(
                Notification.company_id == company_id,
                Notification.user_id == user_id,
                Notification.dedup_key == dedup_key,
            )
        )
        if existing_id is not None:
            return None

    notif = Notification(
        company_id=company_id,
        user_id=user_id,
        title=title[:200],
        description=description,
        severity=severity,
        is_read=False,
        entity_type=entity_type,
        entity_id=entity_id,
        target_link=target_link,
        dedup_key=dedup_key[:160] if dedup_key else None,
    )
    db.add(notif)
    return notif


def _get_role_user_ids(db: Session, company_id: UUID, roles: Iterable[str]) -> list[UUID]:
    return list(
        db.scalars(
            select(User.id).where(
                User.company_id == company_id,
                User.is_active.is_(True),
                User.role.in_(list(roles)),
            )
        ).all()
    )


def notify_audit_assigned(db: Session, audit: Audit, actor: User | None = None) -> int:
    recipients: set[UUID] = set()
    if audit.lead_auditor_id:
        recipients.add(audit.lead_auditor_id)
    if not recipients:
        recipients.update(_get_role_user_ids(db, audit.company_id, ("Admin",)))

    created = 0
    for uid in recipients:
        if actor and uid == actor.id:
            continue
        res = create_dedup_notification(
            db,
            company_id=audit.company_id,
            user_id=uid,
            title=f"Audit Assigned: {audit.code} — {audit.title[:80]}",
            description=f"Domain: {audit.domain} • Framework: {audit.framework}. Target due: {audit.target_due_date or 'TBD'}.",
            severity="info",
            entity_type="Audit",
            entity_id=audit.id,
            target_link="/audits",
            dedup_key=f"audit_assigned:{audit.id}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def notify_finding_created(db: Session, finding: Finding, dept: Department | None = None) -> int:
    recipients: set[UUID] = set()
    if finding.owner_user_id:
        recipients.add(finding.owner_user_id)
    if dept and dept.head_user_id:
        recipients.add(dept.head_user_id)
    if finding.severity == "Critical":
        recipients.update(_get_role_user_ids(db, finding.company_id, ("Admin", "Management")))

    sev = "critical" if finding.severity == "Critical" else "warning"
    created = 0
    for uid in recipients:
        res = create_dedup_notification(
            db,
            company_id=finding.company_id,
            user_id=uid,
            title=f"New {finding.severity} Finding: {finding.code}",
            description=f"{finding.title} (Target SLA: {finding.target_sla_date}). Action plan required.",
            severity=sev,
            entity_type="Finding",
            entity_id=finding.id,
            target_link="/findings-and-actions",
            dedup_key=f"finding_new:{finding.id}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def notify_critical_risk(
    db: Session,
    risk: Risk,
    *,
    escalated_by: User | None = None,
    event_tag: str = "critical",
    note: str | None = None,
) -> int:
    recipients: set[UUID] = set(_get_role_user_ids(db, risk.company_id, ("Admin", "Management")))
    if risk.owner_user_id:
        recipients.add(risk.owner_user_id)

    score = int(risk.probability) * int(risk.impact)
    actor_note = f" Escalated by {escalated_by.full_name}." if escalated_by else ""
    extra_note = f" {note}" if note else ""
    created = 0
    for uid in recipients:
        res = create_dedup_notification(
            db,
            company_id=risk.company_id,
            user_id=uid,
            title=f"Critical Risk Escalation: {risk.code} (Inherent Score {score}/25)",
            description=f"{risk.title} — Target: {risk.escalation_target or 'Board Audit Committee'}.{actor_note}{extra_note}",
            severity="critical",
            entity_type="Risk",
            entity_id=risk.id,
            target_link="/risk-and-compliance",
            dedup_key=f"risk_critical:{risk.id}:{event_tag}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def notify_action_assigned(db: Session, action: CorrectiveAction) -> int:
    recipients: set[UUID] = set()
    if action.assigned_to_user_id:
        recipients.add(action.assigned_to_user_id)
    if not recipients:
        return 0
    created = 0
    for uid in recipients:
        res = create_dedup_notification(
            db,
            company_id=action.company_id,
            user_id=uid,
            title=f"Corrective Action Assigned: {action.code}",
            description=f"{action.title} — Due date: {action.due_date}.",
            severity="info",
            entity_type="CorrectiveAction",
            entity_id=action.id,
            target_link="/findings-and-actions",
            dedup_key=f"action_assigned:{action.id}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def notify_verification_requested(
    db: Session,
    *,
    company_id: UUID,
    entity_type: str,
    entity_id: UUID,
    entity_ref: str,
    title: str,
    description: str,
    link: str,
    lead_user_id: UUID | None = None,
    event_tag: str = "pending",
) -> int:
    recipients: set[UUID] = set(_get_role_user_ids(db, company_id, ("Admin", "Management")))
    if lead_user_id:
        recipients.add(lead_user_id)
    created = 0
    for uid in recipients:
        res = create_dedup_notification(
            db,
            company_id=company_id,
            user_id=uid,
            title=title,
            description=description,
            severity="warning",
            entity_type=entity_type,
            entity_id=entity_id,
            target_link=link,
            dedup_key=f"verify_req:{entity_type}:{entity_id}:{event_tag}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def notify_verification_outcome(
    db: Session,
    *,
    company_id: UUID,
    recipient_user_ids: Iterable[UUID | None],
    entity_type: str,
    entity_id: UUID,
    title: str,
    description: str,
    severity: str,
    link: str,
    event_tag: str,
) -> int:
    created = 0
    for uid in {u for u in recipient_user_ids if u is not None}:
        res = create_dedup_notification(
            db,
            company_id=company_id,
            user_id=uid,
            title=title,
            description=description,
            severity=severity,
            entity_type=entity_type,
            entity_id=entity_id,
            target_link=link,
            dedup_key=f"outcome:{entity_type}:{entity_id}:{event_tag}:{uid}",
        )
        if res is not None:
            created += 1
    return created


def run_company_sla_sweep(db: Session, company: Company, actor: User | None = None) -> dict[str, int | datetime]:
    today = datetime.now(UTC).date()
    upcoming_window = today + timedelta(days=7)
    action_window = today + timedelta(days=5)

    admin_ids = _get_role_user_ids(db, company.id, ("Admin",))
    mgmt_and_admin_ids = _get_role_user_ids(db, company.id, ("Admin", "Management"))

    created_count = 0
    overdue_audits = 0
    overdue_actions = 0
    upcoming_deadlines = 0
    critical_risks = 0

    # 1. Audits: Overdue & Upcoming Deadlines
    audits = list(
        db.scalars(
            select(Audit).where(Audit.company_id == company.id, Audit.status != "Closed")
        ).all()
    )
    for aud in audits:
        if aud.target_due_date is None:
            continue
        if aud.target_due_date < today:
            overdue_audits += 1
            recipients = set(admin_ids)
            if aud.lead_auditor_id:
                recipients.add(aud.lead_auditor_id)
            newly_notified = 0
            for uid in recipients:
                res = create_dedup_notification(
                    db,
                    company_id=company.id,
                    user_id=uid,
                    title=f"Overdue Audit Engagement: {aud.code}",
                    description=f"{aud.title} passed its target completion date ({aud.target_due_date}).",
                    severity="critical",
                    entity_type="Audit",
                    entity_id=aud.id,
                    target_link="/audits",
                    dedup_key=f"audit_overdue:{aud.id}:{aud.target_due_date.isoformat()}",
                )
                if res is not None:
                    created_count += 1
                    newly_notified += 1
            if newly_notified > 0:
                record_audit_history(
                    db,
                    company_id=company.id,
                    actor=actor,
                    category="Risk Escalation",
                    module="SLA Automation",
                    entity_type="Audit",
                    entity_id=aud.id,
                    entity_ref=aud.code,
                    action=f"Automated SLA escalation: audit past target date ({aud.target_due_date})",
                    changes={"target_due_date": str(aud.target_due_date), "status": aud.status},
                    actor_label_override=actor.full_name if actor else "System SLA Engine",
                    actor_role_override=actor.role if actor else "Automated Scheduler",
                )
        elif today <= aud.target_due_date <= upcoming_window:
            upcoming_deadlines += 1
            days_left = (aud.target_due_date - today).days
            res = create_dedup_notification(
                db,
                company_id=company.id,
                user_id=aud.lead_auditor_id or (admin_ids[0] if admin_ids else None),
                title=f"Upcoming Audit Deadline ({days_left}d): {aud.code}",
                description=f"{aud.title} is scheduled to complete by {aud.target_due_date}.",
                severity="warning",
                entity_type="Audit",
                entity_id=aud.id,
                target_link="/audits",
                dedup_key=f"audit_upcoming:{aud.id}:{aud.target_due_date.isoformat()}",
            )
            if res is not None:
                created_count += 1

    # 2. Corrective Actions: Overdue & Upcoming Deadlines
    actions = list(
        db.scalars(
            select(CorrectiveAction).where(
                CorrectiveAction.company_id == company.id,
                CorrectiveAction.status != "Verified",
            )
        ).all()
    )
    for act in actions:
        if act.due_date < today:
            overdue_actions += 1
            recipients = set(admin_ids)
            if act.assigned_to_user_id:
                recipients.add(act.assigned_to_user_id)
            newly_notified = 0
            for uid in recipients:
                res = create_dedup_notification(
                    db,
                    company_id=company.id,
                    user_id=uid,
                    title=f"Overdue Corrective Action: {act.code}",
                    description=f"{act.title} is past its remediation deadline ({act.due_date}).",
                    severity="critical",
                    entity_type="CorrectiveAction",
                    entity_id=act.id,
                    target_link="/findings-and-actions",
                    dedup_key=f"action_overdue:{act.id}:{act.due_date.isoformat()}",
                )
                if res is not None:
                    created_count += 1
                    newly_notified += 1
            if newly_notified > 0:
                record_audit_history(
                    db,
                    company_id=company.id,
                    actor=actor,
                    category="Risk Escalation",
                    module="SLA Automation",
                    entity_type="CorrectiveAction",
                    entity_id=act.id,
                    entity_ref=act.code,
                    action=f"Automated SLA escalation: corrective action overdue since {act.due_date}",
                    changes={"due_date": str(act.due_date), "status": act.status},
                    actor_label_override=actor.full_name if actor else "System SLA Engine",
                    actor_role_override=actor.role if actor else "Automated Scheduler",
                )
        elif today <= act.due_date <= action_window:
            upcoming_deadlines += 1
            days_left = (act.due_date - today).days
            res = create_dedup_notification(
                db,
                company_id=company.id,
                user_id=act.assigned_to_user_id or (admin_ids[0] if admin_ids else None),
                title=f"Action Deadline Approaching ({days_left}d): {act.code}",
                description=f"{act.title} requires completion by {act.due_date}.",
                severity="warning",
                entity_type="CorrectiveAction",
                entity_id=act.id,
                target_link="/findings-and-actions",
                dedup_key=f"action_upcoming:{act.id}:{act.due_date.isoformat()}",
            )
            if res is not None:
                created_count += 1

    # 3. Critical Risks Escalation Check
    crit_risks = list(
        db.scalars(
            select(Risk).where(
                Risk.company_id == company.id,
                Risk.severity == "Critical",
                Risk.status.in_(("Open", "Under Treatment", "In Review")),
            )
        ).all()
    )
    for risk in crit_risks:
        critical_risks += 1
        recipients = set(mgmt_and_admin_ids)
        if risk.owner_user_id:
            recipients.add(risk.owner_user_id)
        for uid in recipients:
            res = create_dedup_notification(
                db,
                company_id=company.id,
                user_id=uid,
                title=f"Critical Risk Monitor: {risk.code} ({risk.status})",
                description=f"{risk.title} — Next review: {risk.next_review_date or 'Scheduled'}.",
                severity="critical",
                entity_type="Risk",
                entity_id=risk.id,
                target_link="/risk-and-compliance",
                dedup_key=f"risk_critical_monitor:{risk.id}:{uid}",
            )
            if res is not None:
                created_count += 1

    # 4. Findings: SLA breaches
    open_findings = list(
        db.scalars(
            select(Finding).where(Finding.company_id == company.id, Finding.status != "Closed")
        ).all()
    )
    for f in open_findings:
        if f.status == "Verification Pending":
            created_count += notify_verification_requested(
                db,
                company_id=company.id,
                entity_type="Finding",
                entity_id=f.id,
                entity_ref=f.code,
                title=f"Verification Pending: {f.code}",
                description=f"{f.title} is awaiting sign-off verification.",
                link="/findings-and-actions",
                lead_user_id=f.lead_auditor_id,
                event_tag="sla_sweep",
            )
        elif f.target_sla_date < today:
            recipients = set(admin_ids)
            if f.owner_user_id:
                recipients.add(f.owner_user_id)
            for uid in recipients:
                res = create_dedup_notification(
                    db,
                    company_id=company.id,
                    user_id=uid,
                    title=f"SLA Breached Finding: {f.code}",
                    description=f"{f.title} passed target SLA ({f.target_sla_date}).",
                    severity="critical",
                    entity_type="Finding",
                    entity_id=f.id,
                    target_link="/findings-and-actions",
                    dedup_key=f"finding_overdue:{f.id}:{f.target_sla_date.isoformat()}",
                )
                if res is not None:
                    created_count += 1

    return {
        "notifications_created": created_count,
        "overdue_audits": overdue_audits,
        "overdue_actions": overdue_actions,
        "upcoming_deadlines": upcoming_deadlines,
        "critical_risks": critical_risks,
        "ran_at": datetime.now(UTC),
    }
