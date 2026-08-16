import {
  Body,
  Controller,
  Delete,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-auth/internal-auth.guard';
import { PermissionsGuard } from '../internal-auth/permissions.guard';
import { RequirePermissions } from '../internal-auth/internal-auth.decorator';
import { UploadMetadataService } from './upload-metadata.service';

export class UploadMetadataBodyDto {
  bucket!: string;
  key!: string;
  sizeBytes!: number;
  usedBytesDelta!: number;
  uploadStatus!: 'COMPLETED' | 'PENDING_COMPRESSION';
  previewS3Key?: string | null;
  previewS3Url?: string | null;
  eventType?: string;
}

@Controller('upload-metadata')
@UseGuards(InternalAuthGuard, PermissionsGuard)
export class UploadMetadataController {
  constructor(private readonly service: UploadMetadataService) {}

  @Post()
  @RequirePermissions('uploads:write')
  async create(@Body() body: UploadMetadataBodyDto) {
    return this.service.processUpload(body);
  }

  @Delete('pending')
  @RequirePermissions('uploads:cleanup')
  async deleteStalePending() {
    return this.service.deleteStalePendingUploads();
  }
}
