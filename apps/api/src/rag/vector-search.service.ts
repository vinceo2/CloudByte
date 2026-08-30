import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';

export type IndexChunkHit = {
  fileId: string;
  sourceFileName: string;
  chunkText: string;
  score?: number | null;
};

export interface SearchOptions {
  fileIds?: string[];
  limit?: number;
}

@Injectable()
export class VectorSearchService {
  constructor(private readonly prisma: PrismaService) {}

  private async embedQuestion(question: string): Promise<number[]> {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });

    return embeddings.embedQuery(question);
  }

  private async fallbackKeywordSearch(question: string, userId: string, options: SearchOptions = {}) {
    const documentChunkModel = (this.prisma as any).documentChunk;
    if (!documentChunkModel?.findMany) {
      return [];
    }

    const chunks = await documentChunkModel.findMany({
      where: {
        ownerId: userId,
        ...(options.fileIds && options.fileIds.length > 0 ? { fileId: { in: options.fileIds } } : {}),
      },
      select: {
        fileId: true,
        sourceFileName: true,
        chunkText: true,
      },
    });

    const normalizedQuestion = question.toLowerCase();
    return chunks
      .map((chunk) => {
        const chunkText = chunk.chunkText.toLowerCase();
        const score = chunkText.includes(normalizedQuestion)
          ? 2
          : Math.max(
              0,
              (chunk.chunkText.match(new RegExp(`\\b${question.trim().split(/\s+/).join('|')}\\b`, 'gi')) ?? [])
                .length,
            );

        return { ...chunk, score };
      })
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, options.limit ?? 5);
  }

  async searchRelevantChunks(authUser: AuthUser, question: string, options: SearchOptions = {}) {
    const user = await this.prisma.user.findUnique({
      where: { cognitoSub: authUser.cognitoSub },
      select: { id: true },
    });

    if (!user) {
      return [];
    }

    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
    const hasQuestion = question.trim().length > 0;
    if (!hasQuestion) {
      return [];
    }

    const fileClause = options.fileIds && options.fileIds.length > 0 ? Prisma.sql`
      AND dc."file_id" = ANY(${options.fileIds})
    ` : Prisma.empty;

    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const embedding = await this.embedQuestion(question);
      const rows = await this.prisma.$queryRaw<Array<{
        fileId: string;
        sourceFileName: string;
        chunkText: string;
        score: number;
      }>>(Prisma.sql`
        SELECT
          dc."file_id" AS "fileId",
          dc."source_file_name" AS "sourceFileName",
          dc."chunk_text" AS "chunkText",
          1 - (dc.embedding <=> CAST(${JSON.stringify(embedding)} AS vector)) AS "score"
        FROM "document_chunks" dc
        WHERE dc."owner_id" = ${user.id}
          ${fileClause}
          AND dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> CAST(${JSON.stringify(embedding)} AS vector)
        LIMIT ${limit}
      `);

      const semanticThreshold = 0.25;
      return rows
        .filter((row) => Number(row.score ?? 0) >= semanticThreshold)
        .map((row) => ({
          fileId: row.fileId,
          sourceFileName: row.sourceFileName,
          chunkText: row.chunkText,
          score: Number(row.score ?? 0),
        }));
    } catch (_error) {
      return this.fallbackKeywordSearch(question, user.id, { ...options, limit });
    }
  }
}
