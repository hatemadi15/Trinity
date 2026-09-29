"""Publish web/public/data to a Cloudflare R2 bucket (S3 API) with content types and immutable cache headers."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import config

WEB_DATA = config.REPO_ROOT / "web" / "public" / "data"
CACHE_CONTROL = "public, max-age=31536000, immutable"
CONTENT_TYPES = {
    ".json": "application/json",
    ".f32": "application/octet-stream",
    ".u16": "application/octet-stream",
    ".bin": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}
REQUIRED_ENV = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")


@dataclass(frozen=True)
class Upload:
    path: Path
    key: str
    content_type: str
    size: int
    cache_control: str = CACHE_CONTROL


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def plan_uploads(root: Path = WEB_DATA, prefix: str = "data") -> list[Upload]:
    """Every file under root, sorted by key, keyed as <prefix>/<relative posix path>."""
    if not root.is_dir():
        raise FileNotFoundError(f"{root} missing; run sync-local --tiles first")
    uploads = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        uploads.append(Upload(path=path, key=f"{prefix}/{rel}" if prefix else rel, content_type=content_type_for(path), size=path.stat().st_size))
    return uploads


def etag_of(path: Path) -> str:
    """MD5 of the file, which is the ETag R2 reports for single-part uploads."""
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def r2_client(env: Mapping[str, str] = os.environ) -> Any:
    """A boto3 S3 client pointed at the account's R2 endpoint. Imported lazily so dry runs need no credentials."""
    missing = [k for k in REQUIRED_ENV if not env.get(k)]
    if missing:
        raise RuntimeError(f"missing environment variables: {', '.join(missing)} (see docs/hosting.md)")
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _unchanged(client: Any, bucket: str, upload: Upload) -> bool:
    try:
        head = client.head_object(Bucket=bucket, Key=upload.key)
    except Exception:  # noqa: BLE001 — NoSuchKey, 404 or a transport error: upload to be safe
        return False
    if int(head.get("ContentLength", -1)) != upload.size:
        return False
    return head.get("ETag", "").strip('"') == etag_of(upload.path)


def publish(
    root: Path = WEB_DATA,
    prefix: str = "data",
    dry_run: bool = False,
    env: Mapping[str, str] = os.environ,
    client: Any | None = None,
) -> list[Upload]:
    """Upload what changed (size + MD5 differ) with ContentType and CacheControl; a dry run only prints the plan."""
    plan = plan_uploads(root, prefix)
    total = sum(u.size for u in plan)
    if dry_run:
        for u in plan:
            print(f"{u.key}  {u.content_type}  {u.size} B")
        print(f"{len(plan)} files, {total / 1e6:.1f} MB, would upload to <bucket>/{prefix} with {CACHE_CONTROL!r}")
        return plan
    client = client or r2_client(env)
    bucket = env.get("R2_BUCKET", "")
    if not bucket:
        raise RuntimeError("missing environment variables: R2_BUCKET (see docs/hosting.md)")
    done: list[Upload] = []
    for u in plan:
        if _unchanged(client, bucket, u):
            continue
        client.upload_file(str(u.path), bucket, u.key, ExtraArgs={"ContentType": u.content_type, "CacheControl": u.cache_control})
        print(f"uploaded {u.key} ({u.size} B)")
        done.append(u)
    print(f"{len(done)} of {len(plan)} files uploaded; {len(plan) - len(done)} unchanged")
    return done
