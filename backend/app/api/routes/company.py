from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.scoring_analytics import compute_department_score_map
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.core import Company, Department, User
from app.schemas.company import (
    CompanyProfileOut,
    CompanyProfileUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)
from app.services.audit_history import record_audit_history

router = APIRouter(tags=["Company & Departments"])


def serialize_department(
    db: Session,
    dept: Department,
    metrics: dict | None = None,
) -> DepartmentOut:
    head_name = None
    if dept.head_user_id:
        head_name = db.scalar(select(User.full_name).where(User.id == dept.head_user_id))
    m = metrics or {}
    return DepartmentOut(
        id=dept.id,
        company_id=dept.company_id,
        head_user_id=dept.head_user_id,
        head_name=head_name,
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
    return [serialize_department(db, d, metrics_map.get(d.id)) for d in depts]


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

