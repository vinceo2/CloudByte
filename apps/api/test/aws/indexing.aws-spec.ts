import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';
import { uploadViaPresignedPost } from './helpers/upload';

describeAwsSmoke('indexing', () => {
  it('text-file-success: uploaded text file becomes indexed and queryable via RAG', async () => {
    const fileName = runFileName('indexing-doc.txt');
    const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));

    const upload = await uploadViaPresignedPost(fileName, contents, 'text/plain');

    const answer = await pollUntil(
      async () => {
        const askResponse = await apiClient.post('/rag/ask', {
          question: 'What unique marker is mentioned in the document?',
          fileIds: [upload.fileId],
        });
        const hasSource = askResponse.body?.sources?.some((source: any) => source.fileId === upload.fileId);
        return hasSource ? askResponse.body : null;
      },
      { description: `file '${fileName}' to be indexed and returned as a RAG source`, timeoutMs: 120_000 },
    );

    expect(answer.sources.some((source: any) => source.fileId === upload.fileId)).toBe(true);
  });
});
