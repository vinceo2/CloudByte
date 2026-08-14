import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { InternalServiceModule } from './internal-service/internal-service.module';
import { InternalAuthModule } from './internal-auth/internal-auth.module';
import { UploadMetadataModule } from './upload-metadata/upload-metadata.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    InternalAuthModule,
    InternalServiceModule,
    UploadMetadataModule,
  ],
})
export class AppModule {}
