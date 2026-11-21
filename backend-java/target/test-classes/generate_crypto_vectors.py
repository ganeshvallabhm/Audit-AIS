import sys
import json
import hashlib
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(backend_dir))

from app.core.security import hash_password, verify_password, compute_event_sha256

# Test vector 1: Password
p_hash = hash_password("AuditDemo2026!Secure")
print("ARGON2ID_HASH:" + p_hash)
print("PY_VERIFY_OK:" + str(verify_password("AuditDemo2026!Secure", p_hash)))
print("PY_VERIFY_BAD:" + str(verify_password("WrongPassword!", p_hash)))

# Test vectors for audit hash
v1 = {"action": "CREATE", "details": None, "nested": {"b": 2, "a": 1}}
v2 = {"unicode": "Caf\u00e9 \u4e2d\u6587 \U0001f512", "symbols": "<>&\"'\\"}
v3 = {"num_int": 42, "num_float": 98.75, "bool_val": True, "empty_map": {}}
v4 = {"timestamp": "2026-11-21T06:30:00Z", "null_field": None}

for i, v in enumerate([v1, v2, v3, v4], 1):
    can = json.dumps(v, sort_keys=True, default=str, separators=(",", ":"))
    h = hashlib.sha256(can.encode("utf-8")).hexdigest()
    print(f"V{i}_CANONICAL:" + can)
    print(f"V{i}_SHA:" + h)
