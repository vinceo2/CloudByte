import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from 'src/auth/current-user.decorator';

export interface PresignedUploadResult {
  name: string;
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
}
