import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompressionJobStatus } from '@prisma/client';

@Injectable()
export class CompressionJobService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(jobKey: string, data: { fileId?: string | null; sourceBucket?: string | null; sourceKey?: string | null }) {
    const existing = await this.prisma.compressionJob.findUnique({
      where: { jobKey },
    });

    if (existing) {
      if (existing.status === CompressionJobStatus.COMPLETED) {
        return { alreadyCompleted: true, job: existing };
      }

      if (existing.status === CompressionJobStatus.PROCESSING) {
        return { alreadyCompleted: false, job: existing, skipped: true };
      }

      await this.prisma.compressionJob.update({
        where: { jobKey },
        data: {
          status: CompressionJobStatus.PROCESSING,
          fileId: data.fileId ?? existing.fileId,
          sourceBucket: data.sourceBucket ?? existing.sourceBucket,
          sourceKey: data.sourceKey ?? existing.sourceKey,
        },
      });

      return { alreadyCompleted: false, job: { ...existing, status: CompressionJobStatus.PROCESSING }, skipped: false };
    }

    const created = await this.prisma.compressionJob.create({
      data: {
        jobKey,
        status: CompressionJobStatus.PROCESSING,
        fileId: data.fileId ?? null,
        sourceBucket: data.sourceBucket ?? null,
        sourceKey: data.sourceKey ?? null,
      },
    });

    return { alreadyCompleted: false, job: created, skipped: false };
  }

  async complete(jobKey: string, payload: { previewS3Key?: string | null; previewS3Url?: string | null }) {
    return this.prisma.compressionJob.update({
      where: { jobKey },
      data: {
        status: CompressionJobStatus.COMPLETED,
        previewS3Key: payload.previewS3Key ?? null,
        previewS3Url: payload.previewS3Url ?? null,
      },
    });
  }

  async fail(jobKey: string, reason?: string) {
    return this.prisma.compressionJob.update({
      where: { jobKey },
      data: {
        status: CompressionJobStatus.FAILED,
      },
    });
  }
}
