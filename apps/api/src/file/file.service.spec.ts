/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TIER_STORAGE_LIMITS, UserTier } from '@cloudbyte/shared';
import { FileService } from './file.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

const buildUser = (tier: UserTier, usedBytes: number = 0) => ({
  id: 'user-1',
  email: 'user@example.com',
  tier,
  storageUsedBytes: usedBytes,
  storageLimitBytes: TIER_STORAGE_LIMITS[tier],
} as any);

const buildFolder = (overrides: Partial<Record<string, any>> = {}) => ({
  id: 'folder-1',
  ownerId: 'user-1',
  parentId: null,
  name: 'My Folder',
  isFolder: true,
  mimeType: null,
  sizeBytes: 0,
  previewS3Key: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
} as any);

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
  let prisma: { file: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock } };
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

    const prismaService = {
      file: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<FileService>(FileService);
    prisma = prismaService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPresignedUploads', () => {
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

    it('should throw when there is not enough space for the upload', async () => {
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

  describe('createPresignedDownloads', () => {
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
  });

  describe('createFolder', () => {
    it('should create a root folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.create.mockResolvedValue(buildFolder());

      const result = await service.createFolder(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'My Folder',
      );

      expect(prisma.file.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'user-1',
          name: 'My Folder',
          parentId: null,
          isFolder: true,
        },
      });
      expect(result).toEqual(
        buildFolder()
      );
    });

    it('should create a folder under a valid parent folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({
        id: 'parent-1',
        name: 'Parent Folder',
      }));
      prisma.file.create.mockResolvedValue(buildFolder({
        id: 'folder-2',
        parentId: 'parent-1',
        name: 'Sub Folder',
      }));

      const result = await service.createFolder(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'Sub Folder',
        'parent-1',
      );

      expect(prisma.file.findUnique).toHaveBeenCalledWith({ where: { id: 'parent-1' } });
      expect(prisma.file.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'user-1',
          name: 'Sub Folder',
          parentId: 'parent-1',
          isFolder: true,
        },
      });
      expect(result.parentId).toBe('parent-1');
    });

    it('should throw when parent folder is invalid', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(null);

      await expect(
        service.createFolder(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'Sub Folder',
          'invalid-parent',
        ),
      ).rejects.toThrow('Invalid parent folder');
    });

    it('should throw when parent resource is not a folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue({
        id: 'parent-1',
        ownerId: 'user-1',
        isFolder: false,
      } as any);

      await expect(
        service.createFolder(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'Sub Folder',
          'parent-1',
        ),
      ).rejects.toThrow('Parent resource must be a folder');
    });
  });

  describe('renameFile', () => {
    it('should rename a file for the owning user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', name: 'Old Name' }));
      prisma.file.update.mockResolvedValue(buildFolder({ id: 'file-1', name: 'New Name' }));

      const result = await service.renameFile(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'file-1',
        'New Name',
      );

      expect(prisma.file.findUnique).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { name: 'New Name' },
      });
      expect(result.name).toBe('New Name');
    });

    it('should throw when the file is not owned by the user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', ownerId: 'other-user', name: 'Old Name' }));

      await expect(
        service.renameFile(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'file-1',
          'New Name',
        ),
      ).rejects.toThrow('Invalid file');

      expect(prisma.file.update).not.toHaveBeenCalled();
    });
  });

  describe('moveFile', () => {
    it('should move a file to a valid parent folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique
        .mockResolvedValueOnce(buildFolder({ id: 'file-1', parentId: null, name: 'Old Name' }))
        .mockResolvedValueOnce(buildFolder({ id: 'folder-2', ownerId: 'user-1', isFolder: true, name: 'Destination' }));
      prisma.file.update.mockResolvedValue(buildFolder({ id: 'file-1', parentId: 'folder-2', name: 'Old Name' }));

      const result = await service.moveFile(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'file-1',
        'folder-2',
      );

      expect(prisma.file.findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'file-1' } });
      expect(prisma.file.findUnique).toHaveBeenNthCalledWith(2, { where: { id: 'folder-2' } });
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { parentId: 'folder-2' },
      });
      expect(result.parentId).toBe('folder-2');
    });

    it('should throw when the file is not owned by the user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', ownerId: 'other-user', name: 'Old Name' }));

      await expect(
        service.moveFile(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'file-1',
          'folder-2',
        ),
      ).rejects.toThrow('Invalid file');

      expect(prisma.file.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete a file for the owning user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', name: 'Old Name' }));
      prisma.file.delete.mockResolvedValue(buildFolder({ id: 'file-1', name: 'Old Name' }));

      const result = await service.deleteFile(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'file-1',
      );

      expect(prisma.file.findUnique).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(result.id).toBe('file-1');
    });

    it('should throw when the file is not owned by the user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', ownerId: 'other-user', name: 'Old Name' }));

      await expect(
        service.deleteFile(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'file-1',
        ),
      ).rejects.toThrow('Invalid file');

      expect(prisma.file.delete).not.toHaveBeenCalled();
    });
  });

  describe('listFolderChildren', () => {
    it('should list children for a folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'folder-1', name: 'My Folder' }));
      prisma.file.findMany.mockResolvedValue([
        buildFolder({ id: 'child-1', parentId: 'folder-1', name: 'Child File',  createdAt: new Date('2026-01-01T01:00:00Z') }),
        buildFolder({ id: 'child-2', parentId: 'folder-1', name: 'Child Folder', createdAt: new Date('2026-01-01T00:30:00Z') }),
      ]);

      const result = await service.listFolderChildren(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'folder-1',
      );

      expect(prisma.file.findMany).toHaveBeenCalledWith({
        where: {
          parentId: 'folder-1',
          ownerId: 'user-1',
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual([
        buildFolder({
          id: 'child-1',
          parentId: 'folder-1',
          name: 'Child File',
          createdAt: new Date('2026-01-01T01:00:00Z')
        }),
        buildFolder({
          id: 'child-2',
          parentId: 'folder-1',
          name: 'Child Folder',
          createdAt: new Date('2026-01-01T00:30:00Z'),
        }),
      ]);
    });

    it('should list children for a folder page 2', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'folder-1', name: 'My Folder' }));
      prisma.file.findMany.mockResolvedValue([]);

      await service.listFolderChildren(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'folder-1',
        2,
      );

      expect(prisma.file.findMany).toHaveBeenCalledWith({
        where: {
          parentId: 'folder-1',
          ownerId: 'user-1',
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 10,
        take: 10,
      });
    });
  });
});
