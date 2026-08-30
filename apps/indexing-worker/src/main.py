import hashlib
import json
import os
import time
from urllib.parse import quote, urlparse

import boto3
import requests
from openai import OpenAI

INTERNAL_API_URL = os.getenv('INTERNAL_API_URL', 'http://internal-api:4000')
CLIENT_ID = os.getenv('INTERNAL_API_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('INTERNAL_API_CLIENT_SECRET', '')
INDEXING_QUEUE_URL = os.getenv('INDEXING_QUEUE_URL', '')
POLL_INTERVAL_SECONDS = float(os.getenv('INDEXING_WORKER_POLL_INTERVAL_MS', '2000')) / 1000.0
SUPPORTED_EXTENSIONS = {'.txt', '.md', '.csv', '.json'}
EMBEDDING_MODEL = 'text-embedding-3-small'

session = boto3.session.Session()
s3 = session.client('s3', region_name=os.getenv('AWS_REGION', 'us-east-1'))
sqs = session.client('sqs', region_name=os.getenv('AWS_REGION', 'us-east-1'))
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY', ''))


def request(path: str, method: str = 'GET', json_body=None):
    headers = {
        'Content-Type': 'application/json',
        'x-internal-client-id': CLIENT_ID,
        'x-internal-client-secret': CLIENT_SECRET,
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


def stream_text_from_s3(bucket: str, key: str):
    obj = s3.get_object(Bucket=bucket, Key=key)
    stream = obj['Body']
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        yield chunk.decode('utf-8', errors='replace')


def chunk_text_stream(bucket: str, key: str, chunk_size: int = 1000):
    buffer = ''
    for piece in stream_text_from_s3(bucket, key):
        buffer += piece
        while len(buffer) >= chunk_size:
            segment = buffer[:chunk_size].strip()
            if segment:
                yield segment
            buffer = buffer[chunk_size:]
    tail = buffer.strip()
    if tail:
        yield tail


def build_vector_doc_id(chunk_text: str) -> str:
    return hashlib.sha256(chunk_text.encode('utf-8')).hexdigest()


def embed_texts(texts):
    if not texts:
        return []
    if not os.getenv('OPENAI_API_KEY'):
        raise RuntimeError('OPENAI_API_KEY is not set for indexing embeddings')
    response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def delete_message(receipt_handle: str):
    if not INDEXING_QUEUE_URL:
        return
    sqs.delete_message(QueueUrl=INDEXING_QUEUE_URL, ReceiptHandle=receipt_handle)


def fetch_next_message():
    if not INDEXING_QUEUE_URL:
        return None, None

    response = sqs.receive_message(
        QueueUrl=INDEXING_QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=20,
        VisibilityTimeout=300,
    )
    messages = response.get('Messages') or []
    if not messages:
        return None, None

    message = messages[0]
    body = message.get('Body')
    if not body:
        delete_message(message.get('ReceiptHandle', ''))
        return None, None

    try:
        return json.loads(body), message.get('ReceiptHandle')
    except json.JSONDecodeError:
        if message.get('ReceiptHandle'):
            delete_message(message['ReceiptHandle'])
        return None, None


def main():
    if not INDEXING_QUEUE_URL:
        raise RuntimeError('INDEXING_QUEUE_URL is required for the indexing worker')

    while True:
        try:
            job, receipt_handle = fetch_next_message()
            if not job:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            job_key = job.get('jobKey')
            source_bucket = job.get('sourceBucket')
            source_key = job.get('sourceKey')
            file_id = job.get('fileId')
            owner_id = job.get('ownerId')
            file_name = job.get('fileName') or os.path.basename(source_key or '')

            if not job_key or not source_bucket or not source_key or not file_id or not owner_id:
                if receipt_handle:
                    delete_message(receipt_handle)
                continue

            extension = os.path.splitext(urlparse(source_key).path)[1].lower()
            if extension not in SUPPORTED_EXTENSIONS:
                request(f'/indexing-jobs/{quote(job_key, safe="")}/fail', 'POST', {'reason': 'Unsupported file type'})
                if receipt_handle:
                    delete_message(receipt_handle)
                continue

            chunks = list(chunk_text_stream(source_bucket, source_key))
            embeddings = embed_texts(chunks)

            payload = {
                'chunks': [
                    {
                        'fileId': file_id,
                        'ownerId': owner_id,
                        'sourceFileName': file_name or os.path.basename(source_key),
                        'chunkIndex': idx,
                        'chunkText': chunk,
                        'embedding': embedding,
                        'embeddingModel': EMBEDDING_MODEL,
                        'vectorDocId': build_vector_doc_id(chunk),
                    }
                    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
                ]
            }

            request(f'/indexing-jobs/{quote(job_key, safe="")}/chunks', 'POST', payload)
            request(f'/indexing-jobs/{quote(job_key, safe="")}/complete', 'POST')
        except Exception as exc:
            print(f'worker error: {exc}')
        finally:
            if 'receipt_handle' in locals() and receipt_handle:
                try:
                    delete_message(receipt_handle)
                except Exception:
                    pass

            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == '__main__':
    main()
