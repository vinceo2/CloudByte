import { readFileSync } from 'fs';
import { join } from 'path';
import { describeAwsSmoke } from './helpers/env';
import { apiClient } from './helpers/api-client';
import { pollUntil } from './helpers/poll';
import { runFileName } from './helpers/run-context';
import { uploadViaPresignedPost } from './helpers/upload';

describeAwsSmoke('rag.query', () => {
  it('returns-indexed-answer: LLM answer references the uploaded document content', async () => {
    const fileName = runFileName('rag-query-doc.txt');
    const contents = readFileSync(join(__dirname, 'fixtures', 'sample.txt'));

    const upload = await uploadViaPresignedPost(fileName, contents, 'text/plain');

    const response = await pollUntil(
      async () => {
        const askResponse = await apiClient.post('/rag/ask', {
          question: 'What unique marker is mentioned in the document?',
          fileIds: [upload.fileId],
        });
        const answered = askResponse.body?.answer?.includes('CLOUDBYTE_SMOKE_MARKER');
        return answered ? askResponse.body : null;
      },
      { description: `RAG answer to reference the indexed content of '${fileName}'`, timeoutMs: 120_000 },
    );

    expect(response.answer).toEqual(expect.stringContaining('CLOUDBYTE_SMOKE_MARKER'));
    expect(response.sources.length).toBeGreaterThan(0);
  });
});
