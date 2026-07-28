/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FileController } from './file.controller';
import { FileService, PresignedUploadResult } from './file.service';
import { CreatePresignedPostDto, CreatePresignedPostFileDto } from './dto/create-presigned-post.dto';

describe('FileController', () => {
  let controller: FileController;
  let fileService: jest.Mocked<FileService>;

  beforeEach(async () => {
    const mockFileService = {
      createPresignedUploads: jest.fn(),
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
  });
});
