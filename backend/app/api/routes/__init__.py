from fastapi import APIRouter

from app.api.routes import audits, auth, company, dashboard, evidence, governance

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(company.router)
api_router.include_router(dashboard.router)
api_router.include_router(audits.router)
api_router.include_router(governance.router)
api_router.include_router(evidence.router)

