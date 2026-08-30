import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-auth/internal-auth.guard';
import { PermissionsGuard } from '../internal-auth/permissions.guard';
import { RequirePermissions } from '../internal-auth/internal-auth.decorator';
import { IndexingJobService } from './indexing-job.service';

class ClaimIndexingJobDto {
  limit?: number;
}

class IndexingChunkDto {
  fileId!: string;
  ownerId!: string;
  sourceFileName!: string;
  chunkIndex!: number;
  chunkText!: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
  vectorDocId?: string | null;
}

@Controller('indexing-jobs')
@UseGuards(InternalAuthGuard, PermissionsGuard)
export class IndexingJobController {
  constructor(private readonly indexingJobService: IndexingJobService) {}

  @Get('pending')
  @RequirePermissions('uploads:write')
  async listPending(@Query('limit') limit = '10') {
    const take = Math.min(Number(limit) || 10, 50);
    return this.indexingJobService.listPending(take);
  }

  @Post('claim')
  @RequirePermissions('uploads:write')
  async claimNext(@Body() body: ClaimIndexingJobDto) {
    return this.indexingJobService.claimNext(body.limit ?? 1);
  }

  @Post(':jobKey/chunks')
  @RequirePermissions('uploads:write')
  async saveChunks(
    @Param('jobKey') jobKey: string,
    @Body() body: { chunks: IndexingChunkDto[] },
  ) {
    return this.indexingJobService.saveChunks(jobKey, body.chunks);
  }

  @Post(':jobKey/complete')
  @RequirePermissions('uploads:write')
  async complete(@Param('jobKey') jobKey: string) {
    return this.indexingJobService.complete(jobKey);
  }

  @Post(':jobKey/fail')
  @RequirePermissions('uploads:write')
  async fail(@Param('jobKey') jobKey: string, @Body() body: { reason?: string }) {
    return this.indexingJobService.fail(jobKey, body.reason);
  }
}
