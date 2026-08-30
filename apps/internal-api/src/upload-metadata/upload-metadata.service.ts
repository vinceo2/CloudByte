import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UploadStatus } from '@prisma/client';
import { CompressionJobService } from '../compression-job/compression-job.service';
import { IndexingJobService } from '../indexing-job/indexing-job.service';

interface UploadMetadataInput {
  bucket: string;
  key: string;
  sizeBytes: number;
  usedBytesDelta: number;
  uploadStatus: 'COMPLETED' | 'PENDING_COMPRESSION';
  previewS3Key?: string | null;
  previewS3Url?: string | null;
  eventType?: string;
}

@Injectable()
export class UploadMetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compressionJobService: CompressionJobService,
    private readonly indexingJobService: IndexingJobService,
  ) {}

  async processUpload(input: UploadMetadataInput) {
    const file = await this.prisma.file.findFirst({
      where: {
        s3Key: input.key,
      },
      include: {
        owner: true,
      },
    });

    if (!file) {
      throw new NotFoundException(`File with S3 key '${input.key}' was not found`);
    }

    const nextStatus =
      input.uploadStatus === 'COMPLETED'
        ? UploadStatus.COMPLETED
        : UploadStatus.PENDING_COMPRESSION;

    const jobKey = `${input.bucket}/${input.key}`;
    const reservation = await this.compressionJobService.reserve(jobKey, {
      fileId: file.id,
      sourceBucket: input.bucket,
      sourceKey: input.key,
    });

    if (reservation.skipped || reservation.alreadyCompleted) {
      return {
        fileId: file.id,
        s3Key: file.s3Key,
        uploadStatus: file.uploadStatus,
        sizeBytes: Number(file.sizeBytes),
        usedBytes: Number(file.owner.storageUsedBytes),
        previewS3Key: file.previewS3Key ?? input.previewS3Key ?? null,
        previewS3Url: input.previewS3Url ?? null,
        bucket: input.bucket,
        eventType: input.eventType ?? 's3:ObjectCreated:Put',
      };
    }

    if (input.uploadStatus === 'COMPLETED' && input.previewS3Key) {
      await this.compressionJobService.complete(jobKey, {
        previewS3Key: input.previewS3Key,
        previewS3Url: input.previewS3Url ?? null,
      });
    }

    const updatedFile = await this.prisma.file.update({
      where: { id: file.id },
      data: {
        sizeBytes: BigInt(input.sizeBytes),
        uploadStatus: nextStatus,
        ...(input.previewS3Key ? { previewS3Key: input.previewS3Key } : {}),
      },
    });

    const usedBytes = BigInt(input.usedBytesDelta);
    const nextUsedBytes = file.owner.storageUsedBytes + usedBytes;

    await this.prisma.user.update({
      where: { id: file.ownerId },
      data: {
        storageUsedBytes: nextUsedBytes,
      },
    });

    if (updatedFile.uploadStatus === UploadStatus.COMPLETED) {
      await this.indexingJobService.enqueueForUpload({
        fileId: updatedFile.id,
        ownerId: updatedFile.ownerId,
        fileName: updatedFile.name,
        mimeType: updatedFile.mimeType,
        sourceBucket: input.bucket,
        sourceKey: updatedFile.s3Key,
      });
    }

    return {
      fileId: updatedFile.id,
      ownerId: updatedFile.ownerId,
      fileName: updatedFile.name,
      mimeType: updatedFile.mimeType ?? null,
      s3Key: updatedFile.s3Key,
      uploadStatus: updatedFile.uploadStatus,
      sizeBytes: Number(updatedFile.sizeBytes),
      usedBytes: Number(nextUsedBytes),
      previewS3Key: updatedFile.previewS3Key ?? input.previewS3Key ?? null,
      previewS3Url: input.previewS3Url ?? null,
      bucket: input.bucket,
      eventType: input.eventType ?? 's3:ObjectCreated:Put',
    };
  }

  async deleteStalePendingUploads() {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const where = {
      createdAt: { lt: cutoff },
      uploadStatus: { not: UploadStatus.COMPLETED },
    };

    return this.prisma.$transaction(async (transaction) => {
      const staleFiles = await transaction.file.findMany({
        where,
        select: { id: true, ownerId: true, sizeBytes: true, uploadStatus: true },
      });

      const chargedBytesByOwner = staleFiles.reduce<Map<string, bigint>>((totals, file) => {
        if (file.uploadStatus !== UploadStatus.PENDING_COMPRESSION) {
          return totals;
        }

        totals.set(file.ownerId, (totals.get(file.ownerId) ?? BigInt(0)) + file.sizeBytes);
        return totals;
      }, new Map());

      await Promise.all(
        [...chargedBytesByOwner].map(([ownerId, chargedBytes]) =>
          transaction.user.update({
            where: { id: ownerId },
            data: {
              storageUsedBytes: { decrement: chargedBytes },
            },
          }),
        ),
      );

      const deletion = await transaction.file.deleteMany({ where });

      return {
        deletedCount: deletion.count,
        cutoff: cutoff.toISOString(),
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
