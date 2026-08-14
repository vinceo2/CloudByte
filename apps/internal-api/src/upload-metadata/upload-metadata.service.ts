import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UploadStatus } from '@prisma/client';

interface UploadMetadataInput {
  bucket: string;
  key: string;
  sizeBytes: number;
  usedBytesDelta: number;
  uploadStatus: 'COMPLETED' | 'PENDING_COMPRESSION';
  eventType?: string;
}

@Injectable()
export class UploadMetadataService {
  constructor(private readonly prisma: PrismaService) {}

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

    const updatedFile = await this.prisma.file.update({
      where: { id: file.id },
      data: {
        sizeBytes: BigInt(input.sizeBytes),
        uploadStatus: nextStatus,
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

    return {
      fileId: updatedFile.id,
      s3Key: updatedFile.s3Key,
      uploadStatus: updatedFile.uploadStatus,
      sizeBytes: Number(updatedFile.sizeBytes),
      usedBytes: Number(nextUsedBytes),
      bucket: input.bucket,
      eventType: input.eventType ?? 's3:ObjectCreated:Put',
    };
  }
}
