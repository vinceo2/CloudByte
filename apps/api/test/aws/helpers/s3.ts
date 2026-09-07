import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getAwsSmokeEnv } from './env';

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const env = getAwsSmokeEnv();
    client = new S3Client({ region: env.region });
  }
  return client;
}

/** Uploads a raw buffer directly to S3, e.g. after obtaining a presigned POST. */
export async function putObjectViaPresignedPost(
  presignedUrl: string,
  fields: Record<string, string>,
  fileName: string,
  contents: Buffer,
  contentType: string,
): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  form.append('Content-Type', contentType);
  form.append('file', new Blob([new Uint8Array(contents)], { type: contentType }), fileName);

  return fetch(presignedUrl, { method: 'POST', body: form });
}

export async function putObject(bucket: string, key: string, body: Buffer, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: any) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

export async function deleteObject(bucket: string, key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Deletes every object under a prefix — used to clean up a test run's S3 footprint. */
export async function deletePrefix(bucket: string, prefix: string) {
  const listed = await s3().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const objects = listed.Contents ?? [];
  if (objects.length === 0) {
    return;
  }
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) },
    }),
  );
}

export function getAwsSmokeEnvBuckets() {
  const env = getAwsSmokeEnv();
  return { filesBucket: env.filesBucket, previewsBucket: env.previewsBucket };
}
