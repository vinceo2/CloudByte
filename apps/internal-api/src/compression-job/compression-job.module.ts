import { Module } from '@nestjs/common';
import { CompressionJobService } from './compression-job.service';

@Module({
  providers: [CompressionJobService],
  exports: [CompressionJobService],
})
export class CompressionJobModule {}
