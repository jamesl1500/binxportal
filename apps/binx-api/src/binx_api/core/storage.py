"""Where uploaded bytes live — S3 when ``UPLOAD_BUCKET`` is set (production
and staging), local disk otherwise (dev and tests).

Every upload belongs to an *area* — ``projects``, ``messages`` or
``agencies`` (which also holds client logos and user avatars/covers, under
its ``clients/`` and ``users/`` prefixes). On S3 an area is a key prefix in
the one bucket; on local disk it's that area's ``*_upload_dir`` setting.

The value saved into a row's ``storage_path`` says which backend holds it:
``s3://<bucket>/<key>`` for S3, a plain filesystem path for local disk. Reads
and deletes go by that value, not by the current config, so rows written
before a switch (a dev database full of local paths, say) keep working.

boto3 is sync, so every S3 call runs in a thread — same as core/email.py.
Deletes are best-effort, same as the old unlink-quietly helpers: a storage
hiccup should never block removing the row that points at the bytes.
"""

import asyncio
import logging
import shutil
from pathlib import Path
from urllib.parse import quote

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from binx_api.core.config import get_settings

logger = logging.getLogger("binx_api.storage")
settings = get_settings()

_S3_SCHEME = "s3://"
# S3's DeleteObjects limit per call.
_DELETE_BATCH = 1000
_STREAM_CHUNK_BYTES = 64 * 1024

# Area -> the Settings field holding its local-disk root.
_LOCAL_DIR_SETTINGS = {
    "projects": "project_upload_dir",
    "messages": "message_upload_dir",
    "agencies": "agency_upload_dir",
}

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name=settings.aws_region)
    return _s3_client


def _local_root(area: str) -> Path:
    return Path(getattr(settings, _LOCAL_DIR_SETTINGS[area]))


def _split_s3(storage_path: str) -> tuple[str, str]:
    bucket, _, key = storage_path.removeprefix(_S3_SCHEME).partition("/")
    return bucket, key


async def save(area: str, key: str, content: bytes, *, content_type: str) -> str:
    """Store ``content`` under ``{area}/{key}`` and return the ``storage_path``
    to record on the row."""
    if settings.upload_bucket:
        bucket = settings.upload_bucket
        full_key = f"{area}/{key}"
        await asyncio.to_thread(
            _get_s3_client().put_object, Bucket=bucket, Key=full_key, Body=content, ContentType=content_type
        )
        return f"{_S3_SCHEME}{bucket}/{full_key}"

    path = _local_root(area) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return str(path)


async def delete(storage_path: str) -> None:
    """Best-effort delete of one stored file."""
    if storage_path.startswith(_S3_SCHEME):
        bucket, key = _split_s3(storage_path)
        try:
            await asyncio.to_thread(_get_s3_client().delete_object, Bucket=bucket, Key=key)
        except (BotoCoreError, ClientError):
            logger.exception("Couldn't delete %s", storage_path)
        return
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        pass


async def delete_prefix(area: str, prefix: str) -> None:
    """Best-effort delete of everything under ``{area}/{prefix}/`` — e.g. all
    of a deleted agency's images. Only covers the currently configured
    backend; a row's own stale-backend file is the per-file delete's job."""
    if not settings.upload_bucket:
        shutil.rmtree(_local_root(area) / prefix, ignore_errors=True)
        return
    try:
        await asyncio.to_thread(_delete_s3_prefix, settings.upload_bucket, f"{area}/{prefix}/")
    except (BotoCoreError, ClientError):
        logger.exception("Couldn't delete s3://%s/%s/%s/", settings.upload_bucket, area, prefix)


def _delete_s3_prefix(bucket: str, prefix: str) -> None:
    client = _get_s3_client()
    keys = [
        obj["Key"]
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix)
        for obj in page.get("Contents", [])
    ]
    for start in range(0, len(keys), _DELETE_BATCH):
        batch = keys[start : start + _DELETE_BATCH]
        client.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True})


def _attachment_disposition(filename: str) -> str:
    # Same encoding Starlette's FileResponse uses for its `filename=`, so a
    # download keeps behaving the same whichever backend served it.
    quoted = quote(filename)
    if quoted != filename:
        return f"attachment; filename*=utf-8''{quoted}"
    return f'attachment; filename="{filename}"'


async def response(storage_path: str, *, media_type: str, filename: str | None = None) -> Response:
    """The HTTP response serving a stored file — inline, or as a download
    named ``filename`` when given. 404s if the bytes are gone."""
    if not storage_path.startswith(_S3_SCHEME):
        if not Path(storage_path).is_file():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
        return FileResponse(path=storage_path, filename=filename, media_type=media_type)

    bucket, key = _split_s3(storage_path)
    try:
        obj = await asyncio.to_thread(_get_s3_client().get_object, Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found") from None
        raise

    body = obj["Body"]
    headers = {"Content-Length": str(obj["ContentLength"])}
    if obj.get("ETag"):
        headers["ETag"] = obj["ETag"]
    if filename is not None:
        headers["Content-Disposition"] = _attachment_disposition(filename)
    # A sync iterator — Starlette runs it in its threadpool, so reading the
    # body never blocks the event loop.
    return StreamingResponse(
        body.iter_chunks(_STREAM_CHUNK_BYTES),
        media_type=media_type,
        headers=headers,
        background=BackgroundTask(body.close),
    )
