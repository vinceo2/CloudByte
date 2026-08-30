import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IndexingJobStatus } from '@prisma/client';

const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/x-javascript',
  'application/javascript',
  'application/csv',
  'text/x-markdown',
  'text/x-csv',
  'text/x-json',
]);

/**
 * File extensions eligible for text Q&A ingestion in the first release pass.
 * PDF/DOCX and other binary formats are intentionally excluded for now.
 */
const SUPPORTED_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json']);

function getExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function isEligibleForIndexing(fileName: string, mimeType?: string | null): boolean {
  const extension = getExtension(fileName);
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  if (!mimeType) {
    return false;
  }

  const normalizedMimeType = mimeType.toLowerCase();
  return (
    normalizedMimeType.startsWith('text/') ||
    normalizedMimeType === 'application/json' ||
    normalizedMimeType === 'application/x-javascript' ||
    normalizedMimeType === 'application/javascript' ||
    normalizedMimeType === 'application/csv' ||
    SUPPORTED_MIME_TYPES.has(normalizedMimeType)
  );
}

@Injectable()
export class IndexingJobService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueues an indexing job for a file that just finished uploading. Skips
   * (and records as NOT_ELIGIBLE) files whose type isn't supported yet, so
   * ingestion never breaks on unsupported files.
   */
  async enqueueForUpload(input: {
    fileId: string;
    ownerId: string;
    fileName: string;
    mimeType?: string | null;
    sourceBucket?: string | null;
    sourceKey?: string | null;
  }) {
    const jobKey = `index/${input.fileId}`;

    const existing = await this.prisma.indexingJob.findUnique({ where: { jobKey } });
    if (existing) {
      const alreadyCompleted = existing.status === IndexingJobStatus.COMPLETED;
      return {
        job: existing,
        skipped: true,
        reason: alreadyCompleted ? 'already-indexed' : 'already-queued',
      };
    }

    const previousJob = await this.prisma.indexingJob.findFirst({
      where: {
        fileId: input.fileId,
        ownerId: input.ownerId,
        status: {
          in: [IndexingJobStatus.COMPLETED, IndexingJobStatus.PROCESSING, IndexingJobStatus.PENDING],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (previousJob) {
      return {
        job: previousJob,
        skipped: true,
        reason: 'already-indexed',
      };
    }

    if (!isEligibleForIndexing(input.fileName, input.mimeType)) {
      const job = await this.prisma.indexingJob.create({
        data: {
          jobKey,
          fileId: input.fileId,
          ownerId: input.ownerId,
          sourceBucket: input.sourceBucket ?? null,
          sourceKey: input.sourceKey ?? null,
          status: IndexingJobStatus.NOT_ELIGIBLE,
          reason: 'Unsupported file type for Q&A indexing',
        },
      });

      return { job, skipped: true, reason: 'not-eligible' };
    }

    const job = await this.prisma.indexingJob.create({
      data: {
        jobKey,
        fileId: input.fileId,
        ownerId: input.ownerId,
        sourceBucket: input.sourceBucket ?? null,
        sourceKey: input.sourceKey ?? null,
        status: IndexingJobStatus.PENDING,
      },
    });

    return { job, skipped: false, reason: null };
  }

  async listPending(take = 10) {
    return this.prisma.indexingJob.findMany({
      where: { status: IndexingJobStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  async claimNext(limit = 1) {
    const pendingJobs = await this.prisma.indexingJob.findMany({
      where: { status: IndexingJobStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    if (!pendingJobs.length) {
      return [];
    }

    return Promise.all(
      pendingJobs.map((job) =>
        this.prisma.indexingJob.update({
          where: { id: job.id },
          data: { status: IndexingJobStatus.PROCESSING },
        }),
      ),
    );
  }

  async markProcessing(jobKey: string) {
    return this.prisma.indexingJob.update({
      where: { jobKey },
      data: { status: IndexingJobStatus.PROCESSING },
    });
  }

  async saveChunks(
    jobKey: string,
    chunks: Array<{
      fileId: string;
      ownerId: string;
      sourceFileName: string;
      chunkIndex: number;
      chunkText: string;
      embedding?: number[] | null;
      embeddingModel?: string | null;
      vectorDocId?: string | null;
    }>,
  ) {
    const job = await this.prisma.indexingJob.findUnique({ where: { jobKey } });

    if (!job) {
      throw new Error(`Indexing job ${jobKey} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await Promise.all(
        chunks.map((chunk) =>
          tx.documentChunk.create({
            data: {
              indexingJobId: job.id,
              fileId: chunk.fileId,
              ownerId: chunk.ownerId,
              sourceFileName: chunk.sourceFileName,
              chunkIndex: chunk.chunkIndex,
              chunkText: chunk.chunkText,
              ...(chunk.embedding ? { embedding: chunk.embedding as any } : {}),
              embeddingModel: chunk.embeddingModel ?? null,
              vectorDocId: chunk.vectorDocId ?? null,
            } as any,
          }),
        ),
      );

      return tx.indexingJob.update({
        where: { id: job.id },
        data: { status: IndexingJobStatus.COMPLETED },
      });
    });
  }

  async complete(jobKey: string) {
    return this.prisma.indexingJob.update({
      where: { jobKey },
      data: { status: IndexingJobStatus.COMPLETED },
    });
  }

  async fail(jobKey: string, reason?: string) {
    return this.prisma.indexingJob.update({
      where: { jobKey },
      data: { status: IndexingJobStatus.FAILED, reason: reason ?? null },
    });
  }
}
