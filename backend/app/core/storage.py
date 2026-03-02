import io
import os
from typing import Tuple

from app.config import settings


def _ensure_local_dir(path: str) -> None:
    """Create the local storage directory if it does not exist."""
    os.makedirs(path, exist_ok=True)


def save_export_file(job_id: str, content: str, format: str) -> Tuple[str, int]:
    """Persist export content to the configured storage backend.

    Args:
        job_id:  UUID string used as the file stem.
        content: Text content to write (JSONL, CSV, etc.).
        format:  File extension / format identifier (e.g. "jsonl", "csv").

    Returns:
        A tuple of ``(file_path, size_bytes)`` where *file_path* is either
        a local filesystem path or an S3 URI.
    """
    ext = format if not format.startswith(".") else format[1:]
    filename = f"{job_id}.{ext}"

    if settings.STORAGE_BACKEND == "s3":
        return _save_to_s3(filename, content)
    else:
        return _save_locally(filename, content)


def _save_locally(filename: str, content: str) -> Tuple[str, int]:
    """Write content to LOCAL_STORAGE_PATH and return (path, size)."""
    _ensure_local_dir(settings.LOCAL_STORAGE_PATH)
    file_path = os.path.join(settings.LOCAL_STORAGE_PATH, filename)
    encoded = content.encode("utf-8")
    with open(file_path, "wb") as fh:
        fh.write(encoded)
    return file_path, len(encoded)


def _save_to_s3(filename: str, content: str) -> Tuple[str, int]:
    """Upload content to S3 and return (s3_uri, size)."""
    import boto3  # imported lazily so local mode has no boto3 dependency

    encoded = content.encode("utf-8")
    s3_client = boto3.client("s3", region_name=settings.AWS_REGION)
    s3_client.upload_fileobj(
        io.BytesIO(encoded),
        settings.AWS_BUCKET_NAME,
        filename,
        ExtraArgs={"ContentType": "text/plain"},
    )
    s3_uri = f"s3://{settings.AWS_BUCKET_NAME}/{filename}"
    return s3_uri, len(encoded)
