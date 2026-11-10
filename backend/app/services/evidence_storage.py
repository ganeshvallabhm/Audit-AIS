import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

ALLOWED_EXTENSION_MIMES: dict[str, set[str]] = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".csv": {"text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"},
    ".json": {"application/json", "text/json", "text/plain"},
    ".log": {"text/plain", "application/octet-stream"},
    ".txt": {"text/plain"},
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    },
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
    },
}

BLOCKED_EXTENSIONS = {".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".js", ".html", ".htm", ".svg", ".php"}


def sanitize_filename(original_name: str | None) -> str:
    raw = (original_name or "evidence.bin").replace("\\", "/").split("/")[-1].strip()
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in raw)
    return cleaned[:255] or "evidence.bin"


def validate_magic_bytes(ext: str, content: bytes) -> None:
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded evidence file cannot be empty.",
        )

    if ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="File content does not match PDF magic signature (%PDF-).",
            )
    elif ext == ".png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="File content does not match PNG magic signature.",
            )
    elif ext in {".jpg", ".jpeg"}:
        if not content.startswith(b"\xff\xd8\xff"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="File content does not match JPEG magic signature.",
            )
    elif ext in {".xlsx", ".docx"}:
        if not content.startswith(b"PK\x03\x04"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"File content does not match OOXML archive signature for {ext}.",
            )
    elif ext in {".csv", ".json", ".log", ".txt"}:
        sample = content[:4096]
        if b"\x00" in sample:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Binary NUL bytes rejected in text evidence format {ext}.",
            )
        try:
            sample.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Text evidence format {ext} must be valid UTF-8.",
            ) from None


async def store_uploaded_evidence(
    file: UploadFile,
    company_id: UUID,
) -> tuple[str, str, str, int, str]:
    """
    Validates extension, MIME, size cap (25 MB), and magic bytes.
    Writes file outside web root under randomized UUID key.
    Returns (safe_original_filename, storage_key, resolved_mime, byte_size, sha256_hex).
    """
    settings = get_settings()
    safe_name = sanitize_filename(file.filename)
    ext = Path(safe_name).suffix.lower()

    if ext in BLOCKED_EXTENSIONS or ext not in ALLOWED_EXTENSION_MIMES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File extension '{ext or 'none'}' is not permitted in the Evidence Vault.",
        )

    declared_mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    allowed_mimes = ALLOWED_EXTENSION_MIMES[ext]
    if declared_mime not in allowed_mimes and declared_mime != "application/octet-stream":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Content-Type '{declared_mime}' does not match allowed types for '{ext}'.",
        )

    chunks: list[bytes] = []
    total_bytes = 0
    chunk_size = 1024 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > settings.max_evidence_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Evidence file exceeds maximum allowed size of {settings.max_evidence_bytes} bytes (25 MB).",
            )
        chunks.append(chunk)

    payload = b"".join(chunks)
    validate_magic_bytes(ext, payload)

    sha256_hex = hashlib.sha256(payload).hexdigest()
    storage_key = f"{company_id}/{uuid4()}{ext}"
    target_path = (settings.evidence_root / storage_key).resolve()
    root_resolved = settings.evidence_root.resolve()
    if root_resolved not in target_path.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage path.")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(payload)

    resolved_mime = declared_mime if declared_mime != "application/octet-stream" else next(iter(allowed_mimes))
    return safe_name, storage_key, resolved_mime, total_bytes, sha256_hex


def resolve_evidence_path(storage_key: str) -> Path:
    settings = get_settings()
    root_resolved = settings.evidence_root.resolve()
    target = (root_resolved / storage_key).resolve()
    if root_resolved not in target.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage key.")
    return target


def verify_stored_file_sha256(storage_key: str, expected_sha256: str) -> tuple[bool, Path]:
    path = resolve_evidence_path(storage_key)
    if not path.is_file():
        return False, path
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(65536):
            digest.update(block)
    return digest.hexdigest() == expected_sha256, path

