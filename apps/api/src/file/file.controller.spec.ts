/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FileController } from './file.controller';
import { FileService, PresignedDownloadResult, PresignedUploadResult } from './file.service';
import { CreatePresignedGetDto } from './dto/create-presigned-get.dto';
import { CreatePresignedPostDto, CreatePresignedPostFileDto } from './dto/create-presigned-post.dto';

describe('FileController', () => {
  let controller: FileController;
  let fileService: jest.Mocked<FileService>;

  beforeEach(async () => {
    const mockFileService = {
      createPresignedUploads: jest.fn(),
      createPresignedDownloads: jest.fn(),
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
  });
});
