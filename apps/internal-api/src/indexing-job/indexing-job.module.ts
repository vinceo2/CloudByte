import { Module } from '@nestjs/common';
import { IndexingJobController } from './indexing-job.controller';
import { IndexingJobService } from './indexing-job.service';

@Module({
  controllers: [IndexingJobController],
  providers: [IndexingJobService],
  exports: [IndexingJobService],
})
export class IndexingJobModule {}
