import { Module } from '@nestjs/common';
import { CompressionJobModule } from '../compression-job/compression-job.module';
import { IndexingJobModule } from '../indexing-job/indexing-job.module';
import { InternalAuthModule } from '../internal-auth/internal-auth.module';
import { UploadMetadataController } from './upload-metadata.controller';
import { UploadMetadataService } from './upload-metadata.service';

@Module({
  imports: [CompressionJobModule, IndexingJobModule, InternalAuthModule],
  controllers: [UploadMetadataController],
  providers: [UploadMetadataService],
})
export class UploadMetadataModule {}
