import logging
import os
from typing import Any, Dict

import requests

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)


def _get_internal_api_url() -> str:
    return os.getenv("INTERNAL_API_URL", "")


def _get_internal_client_id() -> str:
    return os.getenv("INTERNAL_API_CLIENT_ID", "")


def _get_internal_client_secret() -> str:
    return os.getenv("INTERNAL_API_CLIENT_SECRET", "")


def _build_internal_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {"Accept": "application/json"}
    client_id = _get_internal_client_id()
    client_secret = _get_internal_client_secret()

    if client_id and client_secret:
        headers["x-internal-client-id"] = client_id
        headers["x-internal-client-secret"] = client_secret

    return headers


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    internal_api_url = _get_internal_api_url()
    if not internal_api_url:
        raise RuntimeError("INTERNAL_API_URL environment variable is required")

    cleanup_url = f"{internal_api_url.rstrip('/')}/upload-metadata/pending"
    response = requests.delete(
        cleanup_url,
        headers=_build_internal_headers(),
        timeout=15,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Pending upload cleanup API call failed: {response.status_code} {response.text}"
        )

    result = response.json() if response.content else {}
    LOG.info("Deleted %s stale pending uploads", result.get("deletedCount", 0))
    return result