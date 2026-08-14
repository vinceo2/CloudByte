import {
  Body,
  Controller,
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
}
