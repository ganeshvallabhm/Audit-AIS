import os
from pathlib import Path
import sys
import tempfile

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Ensure Settings reads TEST_DATABASE_URL as primary DATABASE_URL in test process
from app.core.config import get_settings

_base_settings = get_settings()
_test_db_url = _base_settings.test_database_url
if not _test_db_url or "_test" not in _test_db_url:
    raise RuntimeError(f"TEST_DATABASE_URL must target a *_test PostgreSQL database, got: {_test_db_url}")

_tmp_evidence_dir = tempfile.mkdtemp(prefix="companyaudit_test_evidence_")
os.environ["DATABASE_URL"] = _test_db_url
os.environ["ENVIRONMENT"] = "test"
os.environ["EVIDENCE_STORAGE_DIR"] = _tmp_evidence_dir
os.environ["ALLOW_DEMO_SEED"] = "true"
get_settings.cache_clear()

from app.core.database import Base  # noqa: E402
import app.models  # noqa: F401, E402
from app.main import app  # noqa: E402
from app.services.seed import seed_database  # noqa: E402

TEST_USER_PASSWORD = "TestSuite!SecurePassword#2025"


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Runs Alembic downgrade/upgrade cycle against PostgreSQL test DB and seeds deterministic data."""
    alembic_cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", _test_db_url)

    # Clean slate via PostgreSQL schema reset so test DB starts deterministic
    engine = create_engine(_test_db_url, pool_pre_ping=True)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    engine.dispose()

    command.upgrade(alembic_cfg, "head")

    SessionTesting = sessionmaker(bind=create_engine(_test_db_url, pool_pre_ping=True), autoflush=False, autocommit=False)
    with SessionTesting() as db:
        seed_database(db, account_password=TEST_USER_PASSWORD)

    yield

    # Verify downgrade + Base.metadata check works cleanly at teardown?
    # Leave test DB intact or drop schema on exit
    engine_cleanup = create_engine(_test_db_url, pool_pre_ping=True)
    Base.metadata.drop_all(bind=engine_cleanup)
    engine_cleanup.dispose()


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def db_session():
    engine = create_engine(_test_db_url, pool_pre_ping=True)
    SessionTesting = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionTesting()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def login_as(client: TestClient, email: str, password: str = TEST_USER_PASSWORD) -> dict[str, str]:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

