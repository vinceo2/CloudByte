import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { objectExists } from './helpers/s3';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';

describeAwsSmoke('files.upload', () => {
  it('presigned-upload-and-s3-put: presigned POST accepts a real S3 upload', async () => {
    const fileName = runFileName('presign-upload.txt');
    const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));

    const presignResponse = await apiClient.post('/files/upload', {
      files: [{ name: fileName, sizeBytes: contents.byteLength }],
    });

    expect(presignResponse.status).toBe(201);
    const [upload] = presignResponse.body.uploads;
    expect(upload).toMatchObject({
      fileId: expect.any(String),
      name: fileName,
      key: expect.any(String),
      url: expect.any(String),
      fields: expect.any(Object),
    });

    const form = new FormData();
    for (const [field, value] of Object.entries(upload.fields)) {
      form.append(field, value as string);
    }
    form.append('file', new Blob([contents], { type: 'text/plain' }), fileName);

    const putResponse = await fetch(upload.url, { method: 'POST', body: form });
    expect([200, 201, 204]).toContain(putResponse.status);

    const exists = await pollUntil(
      async () => (await objectExists(process.env.AWS_TEST_FILES_BUCKET!, upload.key)) || null,
      { description: `S3 object ${upload.key} to exist after presigned POST`, timeoutMs: 30_000 },
    );
    expect(exists).toBe(true);
  });
});
