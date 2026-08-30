import os
from typing import Any, Dict, List, Optional

import boto3
import requests
from mcp.server.fastmcp import FastMCP

INTERNAL_API_URL = os.getenv('INTERNAL_API_URL', 'http://internal-api:4000')
INTERNAL_API_CLIENT_ID = os.getenv('INTERNAL_API_CLIENT_ID', '')
INTERNAL_API_CLIENT_SECRET = os.getenv('INTERNAL_API_CLIENT_SECRET', '')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET', '')

mcp = FastMCP('cloudbyte-tools')

session = boto3.session.Session()
s3_client = session.client('s3', region_name=AWS_REGION)


def internal_request(path: str, method: str = 'GET', json_body: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    if not INTERNAL_API_CLIENT_ID or not INTERNAL_API_CLIENT_SECRET:
        return None

    headers = {
        'Content-Type': 'application/json',
        'x-internal-client-id': INTERNAL_API_CLIENT_ID,
        'x-internal-client-secret': INTERNAL_API_CLIENT_SECRET,
    }

    response = requests.request(
        method,
        f'{INTERNAL_API_URL}{path}',
        headers=headers,
        json=json_body,
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f'{method} {path} failed: {response.status_code} {response.text}')
    if not response.content:
        return None
    return response.json()


@mcp.tool()
def list_user_files(owner_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """List the files owned by a user, scoped to that user only."""
    if not owner_id:
        raise ValueError('owner_id is required')

    try:
        payload = internal_request('/files?ownerId=' + owner_id + '&limit=' + str(limit))
        if payload and isinstance(payload, list):
            return payload
    except Exception:
        pass

    paginator = s3_client.get_paginator('list_objects_v2')
    objects = []
    for page in paginator.paginate(Bucket=AWS_S3_BUCKET, Prefix=f'{owner_id}/'):
        for item in page.get('Contents', []):
            objects.append({
                'key': item['Key'],
                'sizeBytes': item['Size'],
                'lastModified': item['LastModified'].isoformat() if item.get('LastModified') else None,
            })
            if len(objects) >= limit:
                break
        if len(objects) >= limit:
            break

    return objects[:limit]


@mcp.tool()
def get_file_object(file_id: str, owner_id: Optional[str] = None) -> Dict[str, Any]:
    """Fetch metadata for a file and return a presigned object URL when possible."""
    if not file_id:
        raise ValueError('file_id is required')

    try:
        payload = internal_request('/files/' + file_id)
        if payload:
            return payload
    except Exception:
        pass

    try:
        if owner_id:
            prefix = f'{owner_id}/'
        else:
            prefix = ''
        response = s3_client.list_objects_v2(Bucket=AWS_S3_BUCKET, Prefix=prefix)
        for item in response.get('Contents', []):
            if item['Key'].endswith(file_id) or file_id in item['Key']:
                return {
                    'fileId': file_id,
                    'key': item['Key'],
                    'bucket': AWS_S3_BUCKET,
                    'downloadUrl': s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': AWS_S3_BUCKET, 'Key': item['Key']},
                        ExpiresIn=3600,
                    ),
                }
    except Exception:
        pass

    raise ValueError(f'File metadata not found for file_id={file_id}')


@mcp.tool()
def fetch_document_metadata(file_id: str, owner_id: Optional[str] = None) -> Dict[str, Any]:
    """Return lightweight metadata for a file without exposing raw system internals."""
    if not file_id:
        raise ValueError('file_id is required')

    try:
        payload = internal_request('/files/' + file_id + '/metadata')
        if payload:
            return payload
    except Exception:
        pass

    try:
        file_info = get_file_object(file_id, owner_id)
        return {
            'fileId': file_id,
            'key': file_info.get('key'),
            'bucket': file_info.get('bucket'),
            'downloadUrl': file_info.get('downloadUrl'),
            'ownerId': owner_id,
        }
    except Exception as exc:
        raise ValueError(str(exc)) from exc


if __name__ == '__main__':
    mcp.run()
