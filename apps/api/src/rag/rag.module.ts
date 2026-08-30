import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { VectorSearchService } from './vector-search.service';
import { McpServerService } from './mcp-server.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RagController],
  providers: [RagService, VectorSearchService, McpServerService],
  exports: [RagService],
})
export class RagModule {}
