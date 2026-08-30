import { Test, TestingModule } from '@nestjs/testing';
import { IndexingJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IndexingJobService, isEligibleForIndexing } from './indexing-job.service';

describe('IndexingJobService', () => {
  let service: IndexingJobService;
  let prisma: {
    indexingJob: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    documentChunk: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      indexingJob: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      documentChunk: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexingJobService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<IndexingJobService>(IndexingJobService);
  });

  it('accepts supported text extensions and rejects unsupported files', () => {
    expect(isEligibleForIndexing('notes.txt')).toBe(true);
    expect(isEligibleForIndexing('readme.md')).toBe(true);
    expect(isEligibleForIndexing('export.csv')).toBe(true);
    expect(isEligibleForIndexing('config.json')).toBe(true);
    expect(isEligibleForIndexing('invoice.pdf')).toBe(false);
    expect(isEligibleForIndexing('notes.bin', 'application/octet-stream')).toBe(false);
  });

  it('marks unsupported files as not eligible without creating a pending work item', async () => {
    prisma.indexingJob.findUnique.mockResolvedValue(null);
    prisma.indexingJob.findFirst.mockResolvedValue(null);
    prisma.indexingJob.create.mockResolvedValue({
      id: 'job-1',
      jobKey: 'index/file-1',
      fileId: 'file-1',
      ownerId: 'user-1',
      status: IndexingJobStatus.NOT_ELIGIBLE,
    });

    const result = await service.enqueueForUpload({
      fileId: 'file-1',
      ownerId: 'user-1',
      fileName: 'notes.pdf',
      mimeType: 'application/pdf',
      sourceBucket: 'bucket',
      sourceKey: 'user-1/notes.pdf',
    });

    expect(prisma.indexingJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: IndexingJobStatus.NOT_ELIGIBLE,
        reason: 'Unsupported file type for Q&A indexing',
      }),
    }));
    expect(result.skipped).toBe(true);
    expect(result.job.status).toBe(IndexingJobStatus.NOT_ELIGIBLE);
  });

  it('skips re-enqueueing files that were already indexed', async () => {
    prisma.indexingJob.findUnique.mockResolvedValue(null);
    prisma.indexingJob.findFirst.mockResolvedValue({
      id: 'existing-job',
      jobKey: 'index/file-2',
      fileId: 'file-2',
      ownerId: 'user-1',
      status: IndexingJobStatus.COMPLETED,
    });

    const result = await service.enqueueForUpload({
      fileId: 'file-2',
      ownerId: 'user-1',
      fileName: 'roadmap.md',
      mimeType: 'text/markdown',
      sourceBucket: 'bucket',
      sourceKey: 'user-1/roadmap.md',
    });

    expect(prisma.indexingJob.create).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already-indexed');
  });
});
