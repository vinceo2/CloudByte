import { config as loadEnv } from 'dotenv';
import { spawn } from 'node:child_process';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';

loadEnv();

const region = process.env.AWS_REGION ?? 'us-east-1';
const previewBucket = process.env.AWS_PREVIEW_BUCKET ?? '';
const queueUrl = process.env.COMPRESSION_QUEUE_URL ?? '';
const internalApiUrl = process.env.INTERNAL_API_URL ?? '';
const internalClientId = process.env.INTERNAL_API_CLIENT_ID ?? '';
const internalClientSecret = process.env.INTERNAL_API_CLIENT_SECRET ?? '';
const pollIntervalMs = Number(process.env.COMPRESSION_WORKER_POLL_INTERVAL_MS ?? '2000');

const s3Client = new S3Client({ region });
const sqsClient = new SQSClient({ region });

if (!queueUrl) {
  throw new Error('COMPRESSION_QUEUE_URL is required');
}
if (!previewBucket) {
  throw new Error('AWS_PREVIEW_BUCKET is required');
}
if (!internalApiUrl) {
  throw new Error('INTERNAL_API_URL is required');
}

const ffmpegBinary = ffmpegStatic ?? '';
if (!ffmpegBinary) {
  throw new Error('ffmpeg-static was not resolved for this platform');
}
ffmpeg.setFfmpegPath(ffmpegBinary);

function getInternalHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (internalClientId && internalClientSecret) {
    headers['x-internal-client-id'] = internalClientId;
    headers['x-internal-client-secret'] = internalClientSecret;
  }

  return headers;
}

function buildPreviewKey(key, extension) {
  const normalized = String(key).replace(/^\/+/, '').replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : '';
  const filename = normalized.slice(directory.length);
  const base = filename.replace(/\.[^.]+$/, '');
  return `${directory}${base}-preview.${extension}`;
}

function toPreviewUrl(key) {
  return `https://${previewBucket}.s3.${region}.amazonaws.com/${key}`;
}

async function uploadPreviewStream({ key, body, contentType }) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: previewBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function generateImagePreview(bucket, key) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const source = response.Body;

  if (!source) {
    throw new Error(`S3 object ${bucket}/${key} did not return a stream`);
  }

  const previewKey = buildPreviewKey(key, 'jpg');
  const previewStream = source
    .pipe(
      sharp().rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).jpeg({
        quality: 80,
        progressive: true,
        mozjpeg: true,
      }),
    );

  await uploadPreviewStream({
    key: previewKey,
    body: previewStream,
    contentType: 'image/jpeg',
  });

  return previewKey;
}

async function generateVideoPreview(bucket, key) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const source = response.Body;

  if (!source) {
    throw new Error(`S3 object ${bucket}/${key} did not return a stream`);
  }

  const previewKey = buildPreviewKey(key, 'mp4');

  const ffmpegProcess = spawn(
    ffmpegBinary,
    [
      '-y',
      '-i',
      'pipe:0',
      '-vf',
      'scale=-2:720',
      '-c:v',
      'libx265',
      '-b:v',
      '4M',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let ffmpegStderr = '';
  ffmpegProcess.stderr.on('data', (chunk) => {
    ffmpegStderr += chunk.toString();
  });

  const uploadPromise = s3Client.send(
    new PutObjectCommand({
      Bucket: previewBucket,
      Key: previewKey,
      Body: ffmpegProcess.stdout,
      ContentType: 'video/mp4',
    }),
  );

  source.pipe(ffmpegProcess.stdin);

  await new Promise((resolve, reject) => {
    ffmpegProcess.on('error', reject);
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}. ${ffmpegStderr.trim()}`));
    });
  });

  await uploadPromise;

  return previewKey;
}

async function generatePreview(bucket, key, mimeType) {
  if (mimeType.startsWith('image/')) {
    return generateImagePreview(bucket, key);
  }
  if (mimeType.startsWith('video/')) {
    return generateVideoPreview(bucket, key);
  }
  throw new Error(`Unsupported media type for preview generation: ${mimeType}`);
}

async function notifyInternalApi(payload) {
  const response = await fetch(`${internalApiUrl}/upload-metadata`, {
    method: 'POST',
    headers: getInternalHeaders(),
    body: JSON.stringify({
      ...payload,
      usedBytesDelta: 0,
      uploadStatus: 'COMPLETED',
      eventType: 'compression:preview-generated',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Internal API rejected preview completion for ${payload.key}: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
}

async function processMessage(message) {
  if (!message.bucket || !message.key) {
    throw new Error(`Invalid compression payload: ${JSON.stringify(message)}`);
  }

  const fileMeta = await s3Client.send(new HeadObjectCommand({ Bucket: message.bucket, Key: message.key }));
  const mimeType = fileMeta.ContentType ?? 'application/octet-stream';
  const sizeBytes = Number(message.sizeBytes ?? fileMeta.ContentLength ?? 0);

  const previewS3Key = await generatePreview(message.bucket, message.key, mimeType);
  const previewS3Url = toPreviewUrl(previewS3Key);

  await notifyInternalApi({
    bucket: message.bucket,
    key: message.key,
    sizeBytes,
    previewS3Key,
    previewS3Url,
  });

  return {
    bucket: message.bucket,
    key: message.key,
    previewS3Key,
    previewS3Url,
    sizeBytes,
  };
}

async function deleteMessage(receiptHandle) {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}

async function pollQueue() {
  while (true) {
    try {
      const response = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 300,
        }),
      );

      for (const message of response.Messages ?? []) {
        const messageBody = message.Body ?? '';
        const parsedBody = messageBody ? JSON.parse(messageBody) : null;
        const jobKey = parsedBody?.jobKey ?? `${parsedBody?.bucket ?? ''}/${parsedBody?.key ?? ''}`;

        if (!parsedBody || parsedBody.status !== 'PENDING_COMPRESSION') {
          if (message.ReceiptHandle) {
            await deleteMessage(message.ReceiptHandle);
          }
          continue;
        }

        try {
          console.log(`Processing compression job for ${jobKey}`);
          const result = await processMessage(parsedBody);
          console.log(`Preview generated for ${result.key}: ${result.previewS3Url}`);

          if (message.ReceiptHandle) {
            await deleteMessage(message.ReceiptHandle);
          }
        } catch (error) {
          console.error(`Failed to process compression job for ${messageBody}:`, error);
        }
      }
    } catch (error) {
      console.error('Error polling compression queue:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void (async () => {
  console.log(`Compression worker started. Polling ${queueUrl}`);
  await pollQueue();
})();
