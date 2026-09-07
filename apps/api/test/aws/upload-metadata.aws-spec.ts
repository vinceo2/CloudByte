import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';
import { uploadViaPresignedPost } from './helpers/upload';

/**
 * Verifies the full async pipeline that exists purely in the deployed
 * environment: presigned POST -> real S3 PUT -> S3 event notification ->
 * internal-api upload-metadata processing -> file row updated in Postgres.
 * This cannot be exercised by normal integration tests because it depends on
 * real S3 event delivery.
 */
async function uploadTextFile(fileName: string): Promise<{ fileId: string; key: string }> {
  const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));
  const upload = await uploadViaPresignedPost(fileName, contents, 'text/plain');
  return { fileId: upload.fileId, key: upload.key };
}

describeAwsSmoke('upload-metadata', () => {
  it('processes-file-after-upload: file status transitions to COMPLETED once S3 event is processed', async () => {
    const fileName = runFileName('metadata-processing.txt');
    await uploadTextFile(fileName);

    const searchResult = await pollUntil(
      async () => {
        const response = await apiClient.get(`/files/search?filename=${encodeURIComponent(fileName)}&page=1&orderby=createdAt`);
        const match = response.body?.results?.find((file: any) => file.name === fileName);
        return match && match.uploadStatus !== 'PENDING' ? match : null;
      },
      { description: `file '${fileName}' to leave PENDING upload status`, timeoutMs: 90_000 },
    );

    expect(['COMPLETED', 'PENDING_COMPRESSION']).toContain(searchResult.uploadStatus);
    expect(searchResult.sizeBytes).toBeGreaterThan(0);
  });
});
