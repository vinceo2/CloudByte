import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';
import { uploadViaPresignedPost } from './helpers/upload';

const COMPRESSION_THRESHOLD_BYTES = 20 * 1024 * 1024;

async function uploadFixture(fileName: string, fixture: string, contentType: string) {
  const contents = readFileSync(join(__dirname, 'fixtures', fixture));
  if (contents.byteLength < COMPRESSION_THRESHOLD_BYTES) {
    throw new Error(
      `Compression fixture '${fixture}' is ${contents.byteLength} bytes; it must be at least ${COMPRESSION_THRESHOLD_BYTES} bytes`,
    );
  }

  const upload = await uploadViaPresignedPost(fileName, contents, contentType);

  return upload as { fileId: string; key: string; name: string };
}

async function waitForPreview(fileName: string) {
  return pollUntil(
    async () => {
      const response = await apiClient.get(`/files/search?filename=${encodeURIComponent(fileName)}&page=1&orderby=createdAt`);
      const match = response.body?.results?.find((file: any) => file.name === fileName);
      return match && match.previewS3Key ? match : null;
    },
    { description: `preview asset to be generated for '${fileName}'`, timeoutMs: 120_000 },
  );
}

describeAwsSmoke('compression', () => {
  it('image-and-video-success: image upload produces a compressed preview asset', async () => {
    const fileName = runFileName('compression-image.png');
    await uploadFixture(fileName, 'sample.png', 'image/png');

    const processed = await waitForPreview(fileName);

    expect(processed.uploadStatus).toBe('COMPLETED');
    expect(processed.previewS3Key).toEqual(expect.any(String));
  });

  it('image-and-video-success: video upload produces a compressed preview asset', async () => {
    const fileName = runFileName('compression-video.mp4');
    await uploadFixture(fileName, 'sample.mp4', 'video/mp4');

    const processed = await waitForPreview(fileName);

    expect(processed.uploadStatus).toBe('COMPLETED');
    expect(processed.previewS3Key).toEqual(expect.any(String));
  });
});
