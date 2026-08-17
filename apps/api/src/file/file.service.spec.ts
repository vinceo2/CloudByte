/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TIER_STORAGE_LIMITS, UserTier } from '@cloudbyte/shared';
import { UploadStatus } from '@prisma/client';
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

jest.mock('@aws-sdk/client-s3', () => {
  const mockCommand = jest.fn().mockImplementation((input: unknown) => input);

  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
    HeadObjectCommand: mockCommand,
    GetObjectCommand: mockCommand,
    DeleteObjectCommand: mockCommand,
  };
});

describe('FileService', () => {
  let service: FileService;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;
  let prisma: {
    file: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock; delete: jest.Mock };
    user: { update: jest.Mock };
    $queryRawUnsafe: jest.Mock;
    $transaction: jest.Mock;
  };
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
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(),
    };

    prismaService.$transaction.mockImplementation(async (callback: (tx: typeof prismaService) => Promise<any>) => {
      return callback(prismaService);
    });

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
        prisma.file.create.mockResolvedValue({ id: 'file-1', ownerId: 'user-1', name: 'photo.jpg', s3Key: 'user-1/photo.jpg', sizeBytes: 1024, isFolder: false, uploadStatus: UploadStatus.PENDING });

        const result = await service.createPresignedUploads(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          [{ name: 'photo.jpg', sizeBytes: 1024 }],
        );

        expect(result).toEqual([{ fileId: 'file-1', name: 'photo.jpg', key: expect.any(String), url: 'https://example.com/upload' }]);
        expect(createPresignedPostMock).toHaveBeenCalled();
        expect(prisma.file.create).toHaveBeenCalled();
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
    it('should delete a file for the owning user and decrement storage', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 25_000));
      prisma.file.findUnique.mockResolvedValue({
        id: 'file-1',
        ownerId: 'user-1',
        isFolder: false,
        name: 'Old Name',
        s3Key: 'user-1/old-name.txt',
        previewS3Key: 'user-1/old-name.preview.jpg',
        sizeBytes: 10_000,
      });
      prisma.user.update.mockResolvedValue({ id: 'user-1', storageUsedBytes: BigInt(15_000) });
      prisma.file.delete.mockResolvedValue({ id: 'file-1', name: 'Old Name' });

      const result = await service.deleteFile(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'file-1',
      );

      expect(prisma.file.findUnique).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { storageUsedBytes: BigInt(15_000) },
      });
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(result.id).toBe('file-1');
      expect(result.storageUsedBytes).toBe(BigInt(15_000));
    });

    it('should reject deleting a folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'folder-1', isFolder: true, name: 'Folder' }));

      await expect(
        service.deleteFile(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'folder-1',
        ),
      ).rejects.toThrow('Use the folder delete route for folders');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.file.delete).not.toHaveBeenCalled();
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

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.file.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteFolder', () => {
    it('should reparent child records and delete the folder', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'folder-2', parentId: 'folder-1', isFolder: true, name: 'Nested Folder' }));
      prisma.file.updateMany.mockResolvedValue({ count: 2 });
      prisma.file.delete.mockResolvedValue(buildFolder({ id: 'folder-2', parentId: 'folder-1', isFolder: true, name: 'Nested Folder' }));

      const result = await service.deleteFolder(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'folder-2',
      );

      expect(prisma.file.updateMany).toHaveBeenCalledWith({
        where: {
          parentId: 'folder-2',
          ownerId: 'user-1',
        },
        data: {
          parentId: 'folder-1',
        },
      });
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'folder-2' } });
      expect(result.id).toBe('folder-2');
    });

    it('should reject deleting a non-folder resource', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      prisma.file.findUnique.mockResolvedValue(buildFolder({ id: 'file-1', isFolder: false, name: 'File', parentId: null }));

      await expect(
        service.deleteFolder(
          { cognitoSub: 'user-1', email: 'user@example.com' },
          'file-1',
        ),
      ).rejects.toThrow('Resource is not a folder');

      expect(prisma.file.updateMany).not.toHaveBeenCalled();
      expect(prisma.file.delete).not.toHaveBeenCalled();
    });
  });

  describe('searchFiles', () => {
    it('should fuzzy search files and folders for the owning user', async () => {
      authService.getOrCreateUser.mockResolvedValue(buildUser(UserTier.Free, 0));
      const expectedRows = [{ id: 'doc-1', name: 'Document', ownerId: 'user-1', parentId: null, isFolder: false }];
      prisma.$queryRawUnsafe.mockResolvedValue(expectedRows);

      const result = await service.searchFiles(
        { cognitoSub: 'user-1', email: 'user@example.com' },
        'doc',
        2,
        'name' as any,
      );

      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const [query, ownerId, filename, threshold, orderby, take, skip] = prisma.$queryRawUnsafe.mock.calls[0];
      expect(query).toContain('similarity');
      expect(ownerId).toBe('user-1');
      expect(filename).toBe('doc');
      expect(threshold).toBe(0.3);
      expect(orderby).toBe('name');
      expect(take).toBe(10);
      expect(skip).toBe(10);
      expect(result).toEqual(expectedRows);
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
