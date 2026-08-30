import json
import logging
import os
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

import boto3
import requests

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)


def _get_threshold_bytes() -> int:
    return int(os.getenv("UPLOAD_SIZE_THRESHOLD_BYTES", str(20 * 1024 * 1024)))


def _get_internal_api_url() -> str:
    return os.getenv("INTERNAL_API_URL", "")


def _get_internal_client_id() -> str:
    return os.getenv("INTERNAL_API_CLIENT_ID", "")


def _get_internal_client_secret() -> str:
    return os.getenv("INTERNAL_API_CLIENT_SECRET", "")


def _get_compression_queue_url() -> str:
    return os.getenv("COMPRESSION_QUEUE_URL", "")


def _get_indexing_queue_url() -> str:
    return os.getenv("INDEXING_QUEUE_URL", "")


def _get_aws_region() -> str:
    return os.getenv("AWS_REGION", "us-east-1")


def _build_internal_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    client_id = _get_internal_client_id()
    client_secret = _get_internal_client_secret()

    if client_id and client_secret:
        headers["x-internal-client-id"] = client_id
        headers["x-internal-client-secret"] = client_secret

    return headers


def _get_s3_client():
    return boto3.client("s3", region_name=_get_aws_region())


def _read_event_size(bucket_name: str, object_key: str) -> int:
    s3_client = _get_s3_client()
    response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
    return int(response.get("ContentLength", 0))


def _get_object_mime_type(bucket_name: str, object_key: str) -> str:
    s3_client = _get_s3_client()
    response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
    content_type = (response.get("ContentType") or "").strip().lower()
    if content_type:
        return content_type

    extension = os.path.splitext(object_key)[1].lower()
    extension_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }
    return extension_map.get(extension, "")


def _is_media_for_compression(mime_type: str) -> bool:
    return mime_type.startswith("image/") or mime_type.startswith("video/")


def _update_metadata_api(bucket_name: str, object_key: str, size_bytes: int, mime_type: str) -> Dict[str, Any]:
    internal_api_url = _get_internal_api_url()
    if not internal_api_url:
        raise RuntimeError("INTERNAL_API_URL environment variable is required")

    threshold_bytes = _get_threshold_bytes()
    should_compress = size_bytes >= threshold_bytes and _is_media_for_compression(mime_type)
    upload_status = "PENDING_COMPRESSION" if should_compress else "COMPLETED"

    payload = {
        "bucket": bucket_name,
        "key": object_key,
        "sizeBytes": int(size_bytes),
        "usedBytesDelta": int(size_bytes),
        "uploadStatus": upload_status,
        "eventType": "s3:ObjectCreated:Put",
    }

    response = requests.post(
        internal_api_url,
        json=payload,
        headers=_build_internal_headers(),
        timeout=15,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Metadata update API call failed for {bucket_name}/{object_key}: "
            f"{response.status_code} {response.text}"
        )

    return response.json() if response.content else {}


def _queue_compression_message(bucket_name: str, object_key: str, size_bytes: int) -> Dict[str, Any]:
    compression_queue_url = _get_compression_queue_url()
    if not compression_queue_url:
        raise RuntimeError("COMPRESSION_QUEUE_URL environment variable is required for large uploads")

    job_key = f"{bucket_name}/{object_key}"
    queue_payload = {
        "jobKey": job_key,
        "bucket": bucket_name,
        "key": object_key,
        "sizeBytes": int(size_bytes),
        "source": "s3-upload-metadata-lambda",
        "status": "PENDING_COMPRESSION",
        "queuedAt": datetime.now(timezone.utc).isoformat(),
    }

    sqs_client = boto3.client("sqs", region_name=_get_aws_region())
    params: Dict[str, Any] = {
        "QueueUrl": compression_queue_url,
        "MessageBody": json.dumps(queue_payload),
    }

    if compression_queue_url.endswith(".fifo"):
        params["MessageGroupId"] = "compression-worker"
        params["MessageDeduplicationId"] = f"{bucket_name}:{object_key}:{size_bytes}:{int(datetime.now(timezone.utc).timestamp() * 1000)}"

    response = sqs_client.send_message(**params)
    return response


def _queue_indexing_message(bucket_name: str, object_key: str, size_bytes: int, mime_type: str, file_id: str, owner_id: str, file_name: str) -> Dict[str, Any]:
    indexing_queue_url = _get_indexing_queue_url()
    if not indexing_queue_url:
        raise RuntimeError("INDEXING_QUEUE_URL environment variable is required for eligible text uploads")

    job_key = f"index/{file_id}"
    queue_payload = {
        "jobKey": job_key,
        "fileId": file_id,
        "ownerId": owner_id,
        "fileName": file_name,
        "mimeType": mime_type,
        "sourceBucket": bucket_name,
        "sourceKey": object_key,
        "sizeBytes": int(size_bytes),
        "source": "s3-upload-metadata-lambda",
        "status": "PENDING_INDEXING",
        "queuedAt": datetime.now(timezone.utc).isoformat(),
    }

    sqs_client = boto3.client("sqs", region_name=_get_aws_region())
    params: Dict[str, Any] = {
        "QueueUrl": indexing_queue_url,
        "MessageBody": json.dumps(queue_payload),
    }

    if indexing_queue_url.endswith(".fifo"):
        params["MessageGroupId"] = "indexing-worker"
        params["MessageDeduplicationId"] = f"{file_id}:{object_key}:{int(datetime.now(timezone.utc).timestamp() * 1000)}"

    response = sqs_client.send_message(**params)
    return response


def _is_indexing_eligible(mime_type: str, object_key: str) -> bool:
    extension = os.path.splitext(object_key)[1].lower()
    supported_extensions = {".txt", ".md", ".csv", ".json"}
    if extension in supported_extensions:
        return True
    if not mime_type:
        return False
    normalized = mime_type.lower()
    return normalized.startswith("text/") or normalized in {"application/json", "application/csv", "application/x-javascript", "application/javascript"}


def _process_record(record: Dict[str, Any]) -> Dict[str, Any]:
    s3_data = record.get("s3", {})
    bucket_name = s3_data.get("bucket", {}).get("name")
    object_key = urllib.parse.unquote_plus(s3_data.get("object", {}).get("key", ""))

    if not bucket_name or not object_key:
        raise ValueError(f"Invalid S3 event record: {record}")

    size_bytes = int(s3_data.get("object", {}).get("size", 0) or _read_event_size(bucket_name, object_key))
    mime_type = _get_object_mime_type(bucket_name, object_key)
    metadata_response = _update_metadata_api(bucket_name, object_key, size_bytes, mime_type)

    if size_bytes < _get_threshold_bytes() or not _is_media_for_compression(mime_type):
        LOG.info(
            "Upload does not require compression for %s/%s (%s bytes, %s)",
            bucket_name,
            object_key,
            size_bytes,
            mime_type or "unknown",
        )

        if _is_indexing_eligible(mime_type, object_key):
            file_id = metadata_response.get("fileId")
            owner_id = metadata_response.get("ownerId")
            file_name = metadata_response.get("fileName") or os.path.basename(object_key)
            if file_id and owner_id:
                indexing_response = _queue_indexing_message(bucket_name, object_key, size_bytes, mime_type, file_id, owner_id, file_name)
                LOG.info("Queued indexing for eligible text upload %s/%s", bucket_name, object_key)
                return {
                    "bucket": bucket_name,
                    "key": object_key,
                    "sizeBytes": size_bytes,
                    "uploadStatus": "COMPLETED",
                    "mimeType": mime_type,
                    "metadataApi": metadata_response,
                    "indexingQueue": indexing_response,
                }

        return {
            "bucket": bucket_name,
            "key": object_key,
            "sizeBytes": size_bytes,
            "uploadStatus": "COMPLETED",
            "mimeType": mime_type,
            "metadataApi": metadata_response,
        }

    queue_response = _queue_compression_message(bucket_name, object_key, size_bytes)
    LOG.info(
        "Upload exceeds threshold and is media; queued compression for %s/%s (%s bytes, %s)",
        bucket_name,
        object_key,
        size_bytes,
        mime_type,
    )

    return {
        "bucket": bucket_name,
        "key": object_key,
        "sizeBytes": size_bytes,
        "uploadStatus": "PENDING_COMPRESSION",
        "mimeType": mime_type,
        "metadataApi": metadata_response,
        "sqs": queue_response,
    }


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    records = event.get("Records", [])
    if not records:
        LOG.warning("No S3 records found in event")
        return {"processed": 0, "results": []}

    results: List[Dict[str, Any]] = []
    for record in records:
        try:
            results.append(_process_record(record))
        except Exception as exc:  # pragma: no cover - lambda-level safety net
            LOG.exception("Failed to process S3 event record: %s", record)
            results.append({
                "record": record,
                "error": str(exc),
                "status": "FAILED",
            })

    return {"processed": len(results), "results": results}
