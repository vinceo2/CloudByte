import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FileService, PresignedDownloadResult, PresignedUploadResult } from './file.service';
import { CreatePresignedPostDto } from './dto/create-presigned-post.dto';
import { CreatePresignedGetDto } from './dto/create-presigned-get.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  async createUploadUrls(
    @CurrentUser() authUser: AuthUser,
    @Body() body: CreatePresignedPostDto,
  ): Promise<{ uploads: PresignedUploadResult[] }> {
    const uploads = await this.fileService.createPresignedUploads(authUser, body.files);
    return { uploads };
  }

  @UseGuards(JwtAuthGuard)
  @Post('download')
  async createDownloadUrls(
    @CurrentUser() authUser: AuthUser,
    @Body() body: CreatePresignedGetDto,
  ): Promise<{ downloads: PresignedDownloadResult[] }> {
    const downloads = await this.fileService.createPresignedDownloads(authUser, body.keys);
    return { downloads };
  }
}
