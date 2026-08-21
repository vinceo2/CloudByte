import {
  Body,
  Controller,
  Delete,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { InternalAuthGuard } from '../internal-auth/internal-auth.guard';
import { PermissionsGuard } from '../internal-auth/permissions.guard';
import { RequirePermissions } from '../internal-auth/internal-auth.decorator';
import { UploadMetadataService } from './upload-metadata.service';

export class UploadMetadataBodyDto {
  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsInt()
  @Min(0)
  sizeBytes!: number;

  @IsInt()
  @Min(0)
  usedBytesDelta!: number;

  @IsIn(['COMPLETED', 'PENDING_COMPRESSION'])
  uploadStatus!: 'COMPLETED' | 'PENDING_COMPRESSION';

  @IsOptional()
  @IsString()
  previewS3Key?: string | null;

  @IsOptional()
  @IsString()
  previewS3Url?: string | null;

  @IsOptional()
  @IsString()
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
