import { Module } from '@nestjs/common';
import { UploadMetadataController } from './upload-metadata.controller';
import { UploadMetadataService } from './upload-metadata.service';
import { CompressionJobModule } from '../compression-job/compression-job.module';

@Module({
  imports: [CompressionJobModule],
  controllers: [UploadMetadataController],
  providers: [UploadMetadataService],
})
export class UploadMetadataModule {}
