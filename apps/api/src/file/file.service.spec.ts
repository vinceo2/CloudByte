/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TIER_STORAGE_LIMITS, UserTier } from '@cloudbyte/shared';
import { FileService } from './file.service';
import { AuthService } from '../auth/auth.service';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('FileService', () => {
  let service: FileService;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;
  const createPresignedPostMock = createPresignedPost as jest.MockedFunction<typeof createPresignedPost>;
  const getSignedUrlMock = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

  beforeEach(async () => {
    authService = {
      getOrCreateUser: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'AWS_REGION') return 'us-east-1';
        if (key === 'AWS_S3_BUCKET') return 'bucket-name';
        return defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<FileService>(FileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildUser = (tier: UserTier, usedBytes: number = 0) => ({
    id: 'user-1',
    email: 'user@example.com',
    tier,
    storageUsedBytes: usedBytes,
    storageLimitBytes: TIER_STORAGE_LIMITS[tier],
  } as any);

  it.each([UserTier.Free, UserTier.Pro, UserTier.Enterprise])(
    'should allow uploads for %s tier when under limit',
    async (tier) => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(tier));
      createPresignedPostMock.mockResolvedValue({ url: 'https://example.com/upload', fields: {} } as any);

      const result = await service.createPresignedUploads(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        [{ name: 'photo.jpg', sizeBytes: 1024 }],
      );

      expect(result).toEqual([{ name: 'photo.jpg', key: expect.any(String), url: 'https://example.com/upload' }]);
      expect(createPresignedPostMock).toHaveBeenCalled();
    },
  );

  it('should return presigned download URLs for valid keys', async () => {
    getSignedUrlMock.mockResolvedValue('https://example.com/download');

    const result = await service.createPresignedDownloads(
      { cognitoSub: 'user-1', email: 'user@example.com' },
      ['user-1/photo.jpg', 'user-1/document.pdf'],
    );

    expect(result).toEqual([
      { key: 'user-1/photo.jpg', url: 'https://example.com/download' },
      { key: 'user-1/document.pdf', url: 'https://example.com/download' },
    ]);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(2);
  });

  it('should throw when a requested download key does not belong to the user', async () => {
    getSignedUrlMock.mockResolvedValue('https://example.com/download');

    await expect(
      service.createPresignedDownloads(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        ['user-2/photo.jpg'],
      ),
    ).rejects.toThrow('Invalid S3 key');

    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('should throw when there is not enough space for the upload', async () => {
    // make user have only 512 bytes available
    authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, TIER_STORAGE_LIMITS[UserTier.Free] - 512));

    await expect(
      service.createPresignedUploads(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        [{ name: 'photo.jpg', sizeBytes: 1024 }],
      ),
    ).rejects.toThrow('Upload exceeds storage limit');

    expect(createPresignedPostMock).not.toHaveBeenCalled();
  });

  it('should throw when S3 presigned post generation fails', async () => {
    authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));

    createPresignedPostMock.mockRejectedValue(new Error('S3 failure'));

    await expect(
      service.createPresignedUploads(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        [{ name: 'photo.jpg', sizeBytes: 1024 }],
      ),
    ).rejects.toThrow('Failed to create presigned upload for photo.jpg: S3 failure');
  });
});
