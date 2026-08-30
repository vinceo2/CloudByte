import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { AuthUser } from '../auth/current-user.decorator';
import { VectorSearchService } from './vector-search.service';
import { McpServerService } from './mcp-server.service';

interface RAGQuestionOptions {
  fileIds?: string[];
  limit?: number;
}

@Injectable()
export class RagService {
  constructor(
    private readonly vectorSearchService: VectorSearchService,
    private readonly mcpServerService: McpServerService,
  ) {}

  async askQuestion(authUser: AuthUser, question: string, options: RAGQuestionOptions) {
    const fileContextSummary = await this.mcpServerService.buildContextSummary(authUser, 10);
    const relevantChunks = await this.vectorSearchService.searchRelevantChunks(authUser, question, options);

    if (!relevantChunks.length) {
      return {
        answer: 'I could not find an answer in your files for that question.',
        sources: [],
      };
    }

    const model = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      apiKey: process.env.OPENAI_API_KEY,
    });

    const context = relevantChunks
      .map((chunk) => `File: ${chunk.sourceFileName}\n${chunk.chunkText}`)
      .join('\n\n');

    const response = await model.invoke([
      {
        role: 'system',
        content: 'Answer using only the provided file context. If the answer is not in the context, say so plainly and do not invent facts.',
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nAvailable files summary: ${fileContextSummary}\n\nContext:\n${context}`,
      },
    ] as any);

    const answer = typeof response === 'string' ? response : (response as any).content ?? 'No answer was generated.';

    return {
      answer: String(answer),
      sources: relevantChunks.map((chunk) => ({
        fileId: chunk.fileId,
        fileName: chunk.sourceFileName,
        snippet: chunk.chunkText,
      })),
    };
  }
}
