import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module';
import { IndexingJobController } from './indexing-job.controller';
import { IndexingJobService } from './indexing-job.service';

@Module({
  imports: [InternalAuthModule],
  controllers: [IndexingJobController],
  providers: [IndexingJobService],
  exports: [IndexingJobService],
})
export class IndexingJobModule {}
