from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMBaseModel

RoleLiteral = Literal["Admin", "Auditor", "Department Head", "Management", "Viewer"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class RegisterUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=150)
    job_title: str | None = Field(default=None, max_length=120)
    role: RoleLiteral = "Viewer"
    department_id: UUID | None = None
    certifications: list[str] = Field(default_factory=list)


class UserSummary(ORMBaseModel):
    id: UUID
    company_id: UUID
    department_id: UUID | None = None
    department_name: str | None = None
    email: EmailStr
    full_name: str
    initials: str = ""
    job_title: str | None = None
    role: RoleLiteral
    certifications: list[str] = Field(default_factory=list)
    is_active: bool
    last_login_at: datetime | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserSummary


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    job_title: str | None = Field(default=None, max_length=120)
    role: RoleLiteral | None = None
    department_id: UUID | None = None
    is_active: bool | None = None
    certifications: list[str] | None = None

