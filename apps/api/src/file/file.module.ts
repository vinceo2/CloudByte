import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { AuthService } from '../auth/auth.service';

@Module({
  imports: [ConfigModule],
  controllers: [FileController],
  providers: [FileService, AuthService],
})
export class FileModule {}
