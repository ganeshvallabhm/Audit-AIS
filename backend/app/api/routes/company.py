from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.scoring_analytics import compute_department_score_map
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import Audit
from app.models.core import Company, Department, User
from app.models.domains import Employee, FinancialMetric, Project
from app.models.governance import Finding, Risk
from app.schemas.common import MessageResponse
from app.schemas.company import (
    CompanyProfileOut,
    CompanyProfileUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)
from app.services.audit_history import record_audit_history

router = APIRouter(tags=["Company & Departments"])


def serialize_departments(
    db: Session,
    depts: list[Department],
    metrics_map: dict[UUID, dict] | None = None,
) -> list[DepartmentOut]:
    if not depts:
        return []
    head_ids = {d.head_user_id for d in depts if d.head_user_id is not None}
    head_names: dict[UUID, str] = {}
    if head_ids:
        for u_id, full_name in db.execute(
            select(User.id, User.full_name).where(User.id.in_(head_ids))
        ).all():
            head_names[u_id] = full_name

    m_map = metrics_map or {}
    result: list[DepartmentOut] = []
    for dept in depts:
        m = m_map.get(dept.id, {})
        result.append(
            DepartmentOut(
                id=dept.id,
                company_id=dept.company_id,
                head_user_id=dept.head_user_id,
                head_name=head_names.get(dept.head_user_id) if dept.head_user_id else None,
                code=dept.code,
                name=dept.name,
                target_score=float(dept.target_score),
                scoring_weight=float(dept.scoring_weight),
                attention_note=dept.attention_note,
                score=m.get("score"),
                active_audits=m.get("active_audits", 0),
                open_findings=m.get("open_findings", 0),
                risk_count=m.get("risk_count", 0),
                attention_area=m.get("attention_area", False),
                created_at=dept.created_at,
                updated_at=dept.updated_at,
            )
        )
    return result


def serialize_department(
    db: Session,
    dept: Department,
    metrics: dict | None = None,
) -> DepartmentOut:
    m_map = {dept.id: metrics} if metrics is not None else {}
    return serialize_departments(db, [dept], m_map)[0]


@router.get("/company", response_model=CompanyProfileOut)
def get_company_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Company:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company profile not found.")
    return company


@router.put("/company", response_model=CompanyProfileOut)
def update_company_profile(
    payload: CompanyProfileUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Management")),
    db: Session = Depends(get_db),
) -> Company:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company profile not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)

    record_audit_history(
        db,
        company_id=company.id,
        actor=current_user,
        category="Mutation",
        module="Company Profile",
        entity_type="Company",
        entity_id=company.id,
        entity_ref=company.ticker or company.legal_name[:32],
        action="Updated enterprise governance profile and scoring targets",
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(company)
    return company


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentOut]:
    depts = list(
        db.scalars(
            select(Department).where(Department.company_id == current_user.company_id).order_by(Department.code)
        ).all()
    )
    metrics_map, _ = compute_department_score_map(db, current_user.company_id, depts)
    return serialize_departments(db, depts, metrics_map)


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> DepartmentOut:
    existing = db.scalar(
        select(Department).where(
            Department.company_id == current_user.company_id,
            Department.code == payload.code.strip().upper(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Department code '{payload.code}' already exists.",
        )

    if payload.head_user_id is not None:
        head = db.get(User, payload.head_user_id)
        if head is None or head.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Head user not found.")

    dept = Department(
        company_id=current_user.company_id,
        head_user_id=payload.head_user_id,
        code=payload.code.strip().upper(),
        name=payload.name.strip(),
        target_score=payload.target_score,
        scoring_weight=payload.scoring_weight,
        attention_note=payload.attention_note,
    )
    db.add(dept)
    db.flush()

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Departments",
        entity_type="Department",
        entity_id=dept.id,
        entity_ref=dept.code,
        action=f"Created department '{dept.name}'",
        changes={"code": dept.code, "target_score": payload.target_score},
        request=request,
    )
    db.commit()
    db.refresh(dept)
    return serialize_department(db, dept)


@router.put("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: UUID,
    payload: DepartmentUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> DepartmentOut:
    dept = db.get(Department, department_id)
    if dept is None or dept.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "head_user_id" in update_data and update_data["head_user_id"] is not None:
        head = db.get(User, update_data["head_user_id"])
        if head is None or head.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Head user not found.")

    for field, value in update_data.items():
        setattr(dept, field, value)

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Departments",
        entity_type="Department",
        entity_id=dept.id,
        entity_ref=dept.code,
        action=f"Updated department '{dept.name}' configuration",
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(dept)
    metrics_map, _ = compute_department_score_map(db, current_user.company_id, [dept])
    return serialize_department(db, dept, metrics_map.get(dept.id))


@router.delete("/departments/{department_id}", response_model=MessageResponse)
def delete_department(
    department_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    dept = db.get(Department, department_id)
    if dept is None or dept.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    refs: list[str] = []
    audit_cnt = db.scalar(select(func.count(Audit.id)).where(Audit.department_id == dept.id)) or 0
    if audit_cnt:
        refs.append(f"{audit_cnt} audit(s)")
    finding_cnt = db.scalar(select(func.count(Finding.id)).where(Finding.department_id == dept.id)) or 0
    if finding_cnt:
        refs.append(f"{finding_cnt} finding(s)")
    risk_cnt = db.scalar(select(func.count(Risk.id)).where(Risk.department_id == dept.id)) or 0
    if risk_cnt:
        refs.append(f"{risk_cnt} risk(s)")
    user_cnt = db.scalar(select(func.count(User.id)).where(User.department_id == dept.id)) or 0
    if user_cnt:
        refs.append(f"{user_cnt} user(s)")
    proj_cnt = db.scalar(select(func.count(Project.id)).where(Project.department_id == dept.id)) or 0
    if proj_cnt:
        refs.append(f"{proj_cnt} project(s)")
    emp_cnt = db.scalar(select(func.count(Employee.id)).where(Employee.department_id == dept.id)) or 0
    if emp_cnt:
        refs.append(f"{emp_cnt} employee(s)")
    fin_cnt = db.scalar(select(func.count(FinancialMetric.id)).where(FinancialMetric.department_id == dept.id)) or 0
    if fin_cnt:
        refs.append(f"{fin_cnt} financial metric(s)")

    if refs:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete department '{dept.code}' because {', '.join(refs)} reference it.",
        )

    dept_code = dept.code
    dept_name = dept.name
    dept_uuid = dept.id
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Departments",
        entity_type="Department",
        entity_id=dept_uuid,
        entity_ref=dept_code,
        action=f"Deleted unreferenced department '{dept_name}' ({dept_code})",
        request=request,
    )
    db.delete(dept)
    db.commit()
    return MessageResponse(detail=f"Department '{dept_code}' deleted successfully.")
