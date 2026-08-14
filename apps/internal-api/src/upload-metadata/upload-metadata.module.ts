import { Module } from '@nestjs/common';
import { UploadMetadataController } from './upload-metadata.controller';
import { UploadMetadataService } from './upload-metadata.service';

@Module({
  controllers: [UploadMetadataController],
  providers: [UploadMetadataService],
})
export class UploadMetadataModule {}
