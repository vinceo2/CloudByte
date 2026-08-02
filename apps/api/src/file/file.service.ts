import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from 'src/auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FolderSortOrder } from './dto/FolderSortOrder';

export interface PresignedUploadResult {
  name: string;
  key: string;
  url: string;
}

export interface PresignedDownloadResult {
  key: string;
  url: string;
}

@Injectable()
export class FileService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');

    if (!this.bucket) {
      throw new Error('Missing required AWS_S3_BUCKET environment variable');
    }

    this.s3Client = new S3Client({ region });
  }

  async createPresignedUploads(
    authUser: AuthUser,
    files: Array<{ name: string; sizeBytes: number }>,
  ): Promise<PresignedUploadResult[]> {
    const user = await this.authService.getOrCreateUser(authUser as any);

    const requestedBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
    const availableBytes = user.storageLimitBytes - user.storageUsedBytes;

    if (requestedBytes > availableBytes) {
      throw new BadRequestException(
        `Upload exceeds storage limit. Available: ${availableBytes} bytes, requested: ${requestedBytes} bytes.`,
      );
    }

    const uploads = await Promise.all(
      files.map(async (file) => {
        const key = `${authUser.cognitoSub}/${Date.now()}-${file.name}`;
        const metadataKey = 'x-amz-meta-original-filename';
        let presignedPost;

        try {
          presignedPost = await createPresignedPost(this.s3Client, {
            Bucket: this.bucket,
            Key: key,
            Conditions: [
              ['content-length-range', 0, file.sizeBytes],
              { [metadataKey]: file.name },
            ],
            Fields: {
              key,
              [metadataKey]: file.name,
            },
          });
        } catch (error) {
          throw new Error(`Failed to create presigned upload for ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }

        return {
          name: file.name,
          key,
          url: presignedPost.url,
        };
      }),
    );

    return uploads;
  }

  async createFolder(
    authUser: AuthUser,
    name: string,
    parentId?: string,
  ) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    if (parentId) {
      const parent = await this.prisma.file.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.ownerId !== user.id) {
        throw new BadRequestException('Invalid parent folder');
      }
      if (!parent.isFolder) {
        throw new BadRequestException('Parent resource must be a folder');
      }
    }

    const folder = await this.prisma.file.create({
      data: {
        ownerId: user.id,
        name,
        parentId: parentId ?? null,
        isFolder: true,
      },
    });

    return folder;
  }

  async listFolderChildren(
    authUser: AuthUser,
    folderId: string,
    page: number = 1,
    orderby: FolderSortOrder = FolderSortOrder.CreatedAt,
  ) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    const folder = await this.prisma.file.findUnique({
      where: { id: folderId },
    });

    if (!folder || folder.ownerId !== user.id) {
      throw new BadRequestException('Invalid folder');
    }
    if (!folder.isFolder) {
      throw new BadRequestException('Resource is not a folder');
    }

    const take = 10;
    const skip = (page - 1) * take;

    const children = await this.prisma.file.findMany({
      where: {
        parentId: folderId,
        ownerId: user.id,
      },
      orderBy: {
        [orderby]: 'desc',
      },
      skip,
      take,
    });

    return children;
  }

  async renameFile(authUser: AuthUser, fileId: string, name: string) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.ownerId !== user.id) {
      throw new BadRequestException('Invalid file');
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: { name },
    });
  }

  async moveFile(authUser: AuthUser, fileId: string, parentId: string | null) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.ownerId !== user.id) {
      throw new BadRequestException('Invalid file');
    }

    if (parentId) {
      const parent = await this.prisma.file.findUnique({
        where: { id: parentId },
      });

      if (!parent || parent.ownerId !== user.id) {
        throw new BadRequestException('Invalid parent folder');
      }

      if (!parent.isFolder) {
        throw new BadRequestException('Parent resource must be a folder');
      }

      if (parent.id === file.id) {
        throw new BadRequestException('Cannot move a resource into itself');
      }
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: { parentId },
    });
  }

  async deleteFile(authUser: AuthUser, fileId: string) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.ownerId !== user.id) {
      throw new BadRequestException('Invalid file');
    }

    return this.prisma.file.delete({
      where: { id: fileId },
    });
  }

  async searchFiles(
    authUser: AuthUser,
    filename: string,
    page: number = 1,
    orderby: FolderSortOrder = FolderSortOrder.CreatedAt,
  ) {
    const user = await this.authService.getOrCreateUser(authUser as any);

    if (!filename?.trim()) {
      throw new BadRequestException('filename is required');
    }

    const take = 10;
    const skip = (page - 1) * take;
    const threshold = 0.3;

    const query = `
      SELECT id, "ownerId", "parentId", name, "isFolder", "mimeType", "sizeBytes", "previewS3Key", "createdAt", "updatedAt"
      FROM files
      WHERE "ownerId" = $1
        AND name % $2
        AND similarity(name, $2) >= $3
      ORDER BY CASE WHEN $4 = 'name' THEN name ELSE "${orderby}" END DESC, similarity(name, $2) DESC
      LIMIT $5 OFFSET $6
    `;

    return this.prisma.$queryRawUnsafe(query, user.id, filename.trim(), threshold, orderby, take, skip) as Promise<any[]>;
  }

  async createPresignedDownloads(
    authUser: AuthUser,
    keys: string[],
  ): Promise<PresignedDownloadResult[]> {
    const prefix = `${authUser.cognitoSub}/`;

    const downloads = await Promise.all(
      keys.map(async (key) => {
        if (!key.startsWith(prefix)) {
          throw new BadRequestException('Invalid S3 key');
        }

        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });

        const url = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

        return { key, url };
      }),
    );

    return downloads;
  }
}
