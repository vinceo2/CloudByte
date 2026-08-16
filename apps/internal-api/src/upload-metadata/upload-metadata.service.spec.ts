import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UploadStatus } from '@prisma/client';
import { UploadMetadataService } from './upload-metadata.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompressionJobService } from '../compression-job/compression-job.service';

describe('UploadMetadataService', () => {
  let service: UploadMetadataService;
  let prisma: {
    file: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: {
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    compressionJob?: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      file: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );

    const compressionJobService = {
      reserve: jest.fn().mockResolvedValue({ skipped: false, alreadyCompleted: false, job: { jobKey: 'bucket/key' } }),
      complete: jest.fn().mockResolvedValue({ jobKey: 'bucket/key' }),
      fail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadMetadataService,
        { provide: PrismaService, useValue: prisma },
        { provide: CompressionJobService, useValue: compressionJobService },
      ],
    }).compile();

    service = module.get<UploadMetadataService>(UploadMetadataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('updates the file and increments user storage when upload is under threshold', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-123',
      s3Key: 'tenant-1/test.pdf',
      ownerId: 'user-1',
      owner: { id: 'user-1', storageUsedBytes: BigInt(10 * 1024 * 1024) },
    });

    prisma.file.update.mockResolvedValue({
      id: 'file-123',
      s3Key: 'tenant-1/test.pdf',
      sizeBytes: BigInt(5 * 1024 * 1024),
      uploadStatus: UploadStatus.COMPLETED,
    });

    prisma.user.update.mockResolvedValue({ id: 'user-1', storageUsedBytes: BigInt(15 * 1024 * 1024) });

    const result = await service.processUpload({
      bucket: 'cloudbyte-files-dev',
      key: 'tenant-1/test.pdf',
      sizeBytes: 5 * 1024 * 1024,
      usedBytesDelta: 5 * 1024 * 1024,
      uploadStatus: 'COMPLETED',
      eventType: 's3:ObjectCreated:Put',
    });

    expect(prisma.file.findFirst).toHaveBeenCalledWith({
      where: { s3Key: 'tenant-1/test.pdf' },
      include: { owner: true },
    });
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-123' },
      data: {
        sizeBytes: BigInt(5 * 1024 * 1024),
        uploadStatus: UploadStatus.COMPLETED,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { storageUsedBytes: BigInt(15 * 1024 * 1024) },
    });
    expect(result).toMatchObject({
      fileId: 'file-123',
      uploadStatus: UploadStatus.COMPLETED,
      sizeBytes: 5 * 1024 * 1024,
      usedBytes: 15 * 1024 * 1024,
      bucket: 'cloudbyte-files-dev',
    });
  });

  it('marks file as pending compression and queues the required state when upload is large', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-456',
      s3Key: 'tenant-1/video.mp4',
      ownerId: 'user-1',
      owner: { id: 'user-1', storageUsedBytes: BigInt(2 * 1024 * 1024) },
    });

    prisma.file.update.mockResolvedValue({
      id: 'file-456',
      s3Key: 'tenant-1/video.mp4',
      sizeBytes: BigInt(25 * 1024 * 1024),
      uploadStatus: UploadStatus.PENDING_COMPRESSION,
    });

    prisma.user.update.mockResolvedValue({ id: 'user-1', storageUsedBytes: BigInt(27 * 1024 * 1024) });

    const result = await service.processUpload({
      bucket: 'cloudbyte-files-dev',
      key: 'tenant-1/video.mp4',
      sizeBytes: 25 * 1024 * 1024,
      usedBytesDelta: 25 * 1024 * 1024,
      uploadStatus: 'PENDING_COMPRESSION',
    });

    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-456' },
      data: {
        sizeBytes: BigInt(25 * 1024 * 1024),
        uploadStatus: UploadStatus.PENDING_COMPRESSION,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { storageUsedBytes: BigInt(27 * 1024 * 1024) },
    });
    expect(result.uploadStatus).toBe(UploadStatus.PENDING_COMPRESSION);
  });

  it('stores the generated preview key and URL when compression completes', async () => {
    prisma.file.findFirst.mockResolvedValue({
      id: 'file-789',
      s3Key: 'tenant-1/video.mp4',
      ownerId: 'user-1',
      owner: { id: 'user-1', storageUsedBytes: BigInt(1 * 1024 * 1024) },
    });

    prisma.file.update.mockResolvedValue({
      id: 'file-789',
      s3Key: 'tenant-1/video.mp4',
      previewS3Key: 'tenant-1/video-preview.mp4',
      sizeBytes: BigInt(10 * 1024 * 1024),
      uploadStatus: UploadStatus.COMPLETED,
    });

    prisma.user.update.mockResolvedValue({ id: 'user-1', storageUsedBytes: BigInt(11 * 1024 * 1024) });

    const result = await service.processUpload({
      bucket: 'cloudbyte-files-dev',
      key: 'tenant-1/video.mp4',
      sizeBytes: 10 * 1024 * 1024,
      usedBytesDelta: 10 * 1024 * 1024,
      uploadStatus: 'COMPLETED',
      previewS3Key: 'tenant-1/video-preview.mp4',
      previewS3Url: 'https://cloudbyte-previews-dev.s3.us-east-1.amazonaws.com/tenant-1/video-preview.mp4',
    });

    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-789' },
      data: {
        sizeBytes: BigInt(10 * 1024 * 1024),
        uploadStatus: UploadStatus.COMPLETED,
        previewS3Key: 'tenant-1/video-preview.mp4',
      },
    });
    expect(result.previewS3Key).toBe('tenant-1/video-preview.mp4');
    expect(result.previewS3Url).toBe('https://cloudbyte-previews-dev.s3.us-east-1.amazonaws.com/tenant-1/video-preview.mp4');
  });

  it('throws when the file cannot be found by S3 key', async () => {
    prisma.file.findFirst.mockResolvedValue(null);

    await expect(
      service.processUpload({
        bucket: 'cloudbyte-files-dev',
        key: 'missing/file.bin',
        sizeBytes: 128,
        usedBytesDelta: 128,
        uploadStatus: 'COMPLETED',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.file.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('deletes stale non-completed uploads but only decrements storage for pending compression rows', async () => {
    prisma.file.findMany.mockResolvedValue([
      { id: 'file-1', ownerId: 'user-1', sizeBytes: BigInt(4096), uploadStatus: UploadStatus.PENDING },
      { id: 'file-2', ownerId: 'user-1', sizeBytes: BigInt(2048), uploadStatus: UploadStatus.PENDING_COMPRESSION },
      { id: 'file-3', ownerId: 'user-2', sizeBytes: BigInt(1024), uploadStatus: UploadStatus.PENDING_COMPRESSION },
    ]);
    prisma.file.deleteMany.mockResolvedValue({ count: 3 });

    const result = await service.deleteStalePendingUploads();

    expect(prisma.file.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        createdAt: { lt: expect.any(Date) },
        uploadStatus: { not: UploadStatus.COMPLETED },
      }),
      select: { id: true, ownerId: true, sizeBytes: true, uploadStatus: true },
    });
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { storageUsedBytes: { decrement: BigInt(2048) } },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { storageUsedBytes: { decrement: BigInt(1024) } },
    });
    expect(prisma.file.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        uploadStatus: { not: UploadStatus.COMPLETED },
      }),
    });
    expect(result).toEqual({
      deletedCount: 3,
      cutoff: expect.any(String),
    });
  });
});
