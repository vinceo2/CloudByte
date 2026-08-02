/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FileController } from './file.controller';
import { FileService, PresignedDownloadResult, PresignedUploadResult } from './file.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreatePresignedGetDto } from './dto/create-presigned-get.dto';
import { CreatePresignedPostDto, CreatePresignedPostFileDto } from './dto/create-presigned-post.dto';
import { ListFolderChildrenDto, FolderChildrenOrderBy } from './dto/list-folder-children.dto';
import { CreateFolderResponseDto, ListFolderChildrenResponseDto, FolderResponseDto, MoveFileResponseDto, RenameFileResponseDto } from './dto/folder-response.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';

const buildFolder = (overrides: Record<string, unknown> = {}) => ({
  id: 'folder-1',
  ownerId: 'user-123',
  parentId: null,
  name: 'My Folder',
  isFolder: true,
  mimeType: null,
  sizeBytes: BigInt(0),
  s3Key: null,
  previewS3Key: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('FileController', () => {
  let controller: FileController;
  let fileService: jest.Mocked<FileService>;

  beforeEach(async () => {
    const mockFileService = {
      createPresignedUploads: jest.fn(),
      createPresignedDownloads: jest.fn(),
      createFolder: jest.fn(),
      listFolderChildren: jest.fn(),
      renameFile: jest.fn(),
      moveFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [{ provide: FileService, useValue: mockFileService }],
    }).compile();

    controller = module.get<FileController>(FileController);
    fileService = module.get(FileService) as jest.Mocked<FileService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createUploadUrls', () => {
    it('should return upload URLs for valid files', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const body: CreatePresignedPostDto = {
        files: [
          { name: 'photo.jpg', sizeBytes: 1024 },
          { name: 'document.pdf', sizeBytes: 2048 },
        ],
      };
      const expectedUploads: PresignedUploadResult[] = [
        { name: 'photo.jpg', key: 'user-123/123-photo.jpg', url: 'https://example.com/upload1' },
        { name: 'document.pdf', key: 'user-123/123-document.pdf', url: 'https://example.com/upload2' },
      ];

      fileService.createPresignedUploads.mockResolvedValue(expectedUploads);

      const result = await controller.createUploadUrls(user as any, body);

      expect(fileService.createPresignedUploads).toHaveBeenCalledWith(user, body.files);
      expect(result).toEqual({ uploads: expectedUploads });
    });
  });

  describe('createDownloadUrls', () => {
    it('should return download URLs for valid keys', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const body: CreatePresignedGetDto = { keys: ['user-123/file1.txt', 'user-123/file2.txt'] };
      const expectedDownloads: PresignedDownloadResult[] = [
        { key: 'user-123/file1.txt', url: 'https://example.com/download1' },
        { key: 'user-123/file2.txt', url: 'https://example.com/download2' },
      ];

      fileService.createPresignedDownloads.mockResolvedValue(expectedDownloads);

      const result = await controller.createDownloadUrls(user as any, body);

      expect(fileService.createPresignedDownloads).toHaveBeenCalledWith(user, body.keys);
      expect(result).toEqual({ downloads: expectedDownloads });
    });
  });

  describe('createFolder', () => {
    it('should create a folder', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const body: CreateFolderDto = {
        name: 'My Folder',
        parentId: 'parent-1',
      };
      const folderRecord = buildFolder({ parentId: 'parent-1' });
      const expectedFolder = plainToInstance(CreateFolderResponseDto, folderRecord, { excludeExtraneousValues: true });

      fileService.createFolder.mockResolvedValue(folderRecord);

      const result = await controller.createFolder(user as any, body);

      expect(fileService.createFolder).toHaveBeenCalledWith(user, body.name, body.parentId);
      expect(result).toBeInstanceOf(CreateFolderResponseDto);
      expect(result).toEqual(expectedFolder);
    });
  });

  describe('listFolderChildren', () => {
    it('should list folder children with query params', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const folderId = 'folder-1';
      const query: ListFolderChildrenDto = { page: 2, orderby: FolderChildrenOrderBy.Name };
      const childRecord = buildFolder({
        id: 'child-1',
        parentId: folderId,
        name: 'File A',
        isFolder: false,
        mimeType: 'text/plain',
        sizeBytes: BigInt(123),
      });
      const expectedChildren = plainToInstance(FolderResponseDto, [
        {
          id: 'child-1',
          ownerId: 'user-123',
          parentId: folderId,
          name: 'File A',
          isFolder: false,
          mimeType: 'text/plain',
          sizeBytes: 123,
          previewS3Key: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ], { excludeExtraneousValues: true });

      fileService.listFolderChildren.mockResolvedValue([childRecord]);

      const result = await controller.listFolderChildren(user as any, folderId, query);

      expect(fileService.listFolderChildren).toHaveBeenCalledWith(user, folderId, query.page, query.orderby);
      expect(result).toBeInstanceOf(ListFolderChildrenResponseDto);
      expect(result).toEqual({ children: expectedChildren });
    });
  });

  describe('renameFile', () => {
    it('should rename a file and return the updated resource', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const body: RenameFileDto = { name: 'Renamed File' };
      const renamedRecord = buildFolder({ id: 'file-1', name: 'Renamed File' });

      fileService.renameFile.mockResolvedValue(renamedRecord);

      const result = await controller.renameFile(user as any, 'file-1', body);

      expect(fileService.renameFile).toHaveBeenCalledWith(user, 'file-1', body.name);
      expect(result).toBeInstanceOf(RenameFileResponseDto);
      expect(result).toEqual(plainToInstance(RenameFileResponseDto, renamedRecord, { excludeExtraneousValues: true }));
    });
  });

  describe('moveFile', () => {
    it('should move a file and return the updated resource', async () => {
      const user = { cognitoSub: 'user-123', email: 'test@example.com' };
      const body: MoveFileDto = { parentId: 'folder-2' };
      const movedRecord = buildFolder({ id: 'file-1', parentId: 'folder-2', name: 'Moved File' });

      fileService.moveFile.mockResolvedValue(movedRecord);

      const result = await controller.moveFile(user as any, 'file-1', body);

      expect(fileService.moveFile).toHaveBeenCalledWith(user, 'file-1', body.parentId);
      expect(result).toBeInstanceOf(MoveFileResponseDto);
      expect(result).toEqual(plainToInstance(MoveFileResponseDto, movedRecord, { excludeExtraneousValues: true }));
    });
  });

  describe('dto validation', () => {
    it('should reject files without a name', async () => {
      const dto = plainToInstance(CreatePresignedPostDto, {
        files: [{ name: '', sizeBytes: 1024 }],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].children?.[0].children?.[0].property).toBe('name');
    });

    it('should reject files with a negative size', async () => {
      const dto = plainToInstance(CreatePresignedPostDto, {
        files: [{ name: 'photo.jpg', sizeBytes: -100 }],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].children?.[0].children?.[0].property).toBe('sizeBytes');
    });

    it('should reject when files is missing', async () => {
      const dto = plainToInstance(CreatePresignedPostDto, {});

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('files');
    });

    it('should reject when keys is not an array', async () => {
      const dto = plainToInstance(CreatePresignedGetDto, { keys: 'not-an-array' });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('keys');
    });

    it('should reject when keys is empty', async () => {
      const dto = plainToInstance(CreatePresignedGetDto, { keys: [] });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('keys');
    });

    it('should reject when a key item is not a string', async () => {
      const dto = plainToInstance(CreatePresignedGetDto, { keys: ['valid-key', 123] });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('keys');
      expect(errors[0].constraints?.isString).toBeDefined();
    });

    it('should reject folders without a name', async () => {
      const dto = plainToInstance(CreateFolderDto, { name: '' });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('name');
    });

    it('should reject rename requests with an empty name', async () => {
      const dto = plainToInstance(RenameFileDto, { name: '' });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('name');
    });
  });
});
