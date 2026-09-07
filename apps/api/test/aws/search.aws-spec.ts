import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';
import { uploadViaPresignedPost } from './helpers/upload';

describeAwsSmoke('search.list-and-download-work', () => {
  it('lists an uploaded file and returns a working presigned download URL', async () => {
    const fileName = runFileName('search-download.txt');
    const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));

    const upload = await uploadViaPresignedPost(fileName, contents, 'text/plain');

    const found = await pollUntil(
      async () => {
        const response = await apiClient.get(`/files/search?filename=${encodeURIComponent(fileName)}&page=1&orderby=createdAt`);
        return response.body?.results?.find((file: any) => file.name === fileName) ?? null;
      },
      { description: `search to return uploaded file '${fileName}'`, timeoutMs: 30_000 },
    );
    expect(found).toMatchObject({ name: fileName, isFolder: false });

    const downloadResponse = await apiClient.post('/files/download', { keys: [upload.key] });
    expect(downloadResponse.status).toBe(201);
    const [download] = downloadResponse.body.downloads;
    expect(download.key).toBe(upload.key);

    const objectResponse = await fetch(download.url);
    expect(objectResponse.status).toBe(200);
    const downloaded = Buffer.from(await objectResponse.arrayBuffer());
    expect(downloaded.equals(contents)).toBe(true);
  });
});

describeAwsSmoke('search.fuzzy', () => {
  it('matches a filename with a one-character typo', async () => {
    const fileName = runFileName('fuzzy-search-quarterly-report.txt');
    const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));

    const upload = await uploadViaPresignedPost(fileName, contents, 'text/plain');

    const typoIndex = fileName.indexOf('quarterly') + 1;
    const fuzzyQuery = `${fileName.slice(0, typoIndex)}x${fileName.slice(typoIndex + 1)}`;
    const match = await pollUntil(
      async () => {
        const response = await apiClient.get(
          `/files/search?filename=${encodeURIComponent(fuzzyQuery)}&page=1&orderby=createdAt`,
        );
        return response.body?.results?.find((file: any) => file.name === fileName) ?? null;
      },
      {
        description: `fuzzy search to match '${fileName}' for query '${fuzzyQuery}'`,
        timeoutMs: 30_000,
      },
    );

    expect(match).toMatchObject({ name: fileName, isFolder: false });
  });
});
