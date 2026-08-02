import { Body, ClassSerializerInterceptor, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { FileService, PresignedDownloadResult, PresignedUploadResult } from './file.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreatePresignedPostDto } from './dto/create-presigned-post.dto';
import { CreatePresignedGetDto } from './dto/create-presigned-get.dto';
import { ListFolderChildrenDto } from './dto/list-folder-children.dto';
import {
  CreateFolderResponseDto,
  ListFolderChildrenResponseDto,
} from './dto/folder-response.dto';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('files')
@UseInterceptors(ClassSerializerInterceptor)
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

  @UseGuards(JwtAuthGuard)
  @Post('folders')
  async createFolder(
    @CurrentUser() authUser: AuthUser,
    @Body() body: CreateFolderDto,
  ): Promise<CreateFolderResponseDto> {
    const folder = await this.fileService.createFolder(authUser, body.name, body.parentId);
    return plainToInstance(CreateFolderResponseDto, folder, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard)
  @Get('folders/:folderId')
  async listFolderChildren(
    @CurrentUser() authUser: AuthUser,
    @Param('folderId') folderId: string,
    @Query() query: ListFolderChildrenDto,
  ): Promise<ListFolderChildrenResponseDto> {
    const children = await this.fileService.listFolderChildren(
      authUser,
      folderId,
      query.page,
      query.orderby,
    );
    return plainToInstance(ListFolderChildrenResponseDto, { children }, { excludeExtraneousValues: true });
  }
}
