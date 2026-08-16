import { Test, TestingModule } from '@nestjs/testing';
import { UploadMetadataController } from './upload-metadata.controller';
import { UploadMetadataService } from './upload-metadata.service';
import { InternalAuthGuard } from '../internal-auth/internal-auth.guard';
import { InternalAuthService } from '../internal-auth/internal-auth.service';
import { PermissionsGuard } from '../internal-auth/permissions.guard';

describe('UploadMetadataController', () => {
  let controller: UploadMetadataController;
  let service: { processUpload: jest.Mock; deleteStalePendingUploads: jest.Mock };

  beforeEach(async () => {
    service = {
      processUpload: jest.fn(),
      deleteStalePendingUploads: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadMetadataController],
      providers: [
        { provide: UploadMetadataService, useValue: service },
        { provide: InternalAuthService, useValue: { validateClient: jest.fn() } },
        { provide: PermissionsGuard, useValue: { canActivate: jest.fn(() => true) } },
        InternalAuthGuard,
      ],
    }).compile();

    controller = module.get<UploadMetadataController>(UploadMetadataController);
  });

  it('delegates the upload metadata payload to the service', async () => {
    service.processUpload.mockResolvedValue({
      fileId: 'file-123',
      uploadStatus: 'COMPLETED',
      sizeBytes: 4096,
      usedBytes: 4096,
    });

    const payload = {
      bucket: 'cloudbyte-files-dev',
      key: 'tenant-1/file.txt',
      sizeBytes: 4096,
      usedBytesDelta: 4096,
      uploadStatus: 'COMPLETED' as const,
      eventType: 's3:ObjectCreated:Put',
    };

    const result = await controller.create(payload);

    expect(service.processUpload).toHaveBeenCalledWith(payload);
    expect(result).toMatchObject({
      fileId: 'file-123',
      uploadStatus: 'COMPLETED',
    });
  });

  it('creates valid guard instances for internal auth enforcement', () => {
    const authGuard = new InternalAuthGuard({ validateClient: jest.fn() } as any);
    const permissionsGuard = new PermissionsGuard({ getAllAndOverride: jest.fn() } as any);

    expect(authGuard).toBeInstanceOf(InternalAuthGuard);
    expect(permissionsGuard).toBeInstanceOf(PermissionsGuard);
  });

  it('delegates stale pending upload cleanup to the service', async () => {
    service.deleteStalePendingUploads.mockResolvedValue({
      deletedCount: 2,
      cutoff: '2026-08-16T00:00:00.000Z',
    });

    await expect(controller.deleteStalePending()).resolves.toEqual({
      deletedCount: 2,
      cutoff: '2026-08-16T00:00:00.000Z',
    });
    expect(service.deleteStalePendingUploads).toHaveBeenCalledTimes(1);
  });
});
