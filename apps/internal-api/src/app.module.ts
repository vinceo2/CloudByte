import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { InternalAuthModule } from './internal-auth/internal-auth.module';
import { UploadMetadataModule } from './upload-metadata/upload-metadata.module';
import { CompressionJobModule } from './compression-job/compression-job.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    InternalAuthModule,
    UploadMetadataModule,
    CompressionJobModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
