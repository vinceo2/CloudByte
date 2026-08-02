import { Body, ClassSerializerInterceptor, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { FileService, PresignedDownloadResult, PresignedUploadResult } from './file.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreatePresignedPostDto } from './dto/create-presigned-post.dto';
import { CreatePresignedGetDto } from './dto/create-presigned-get.dto';
import { ListFolderChildrenDto } from './dto/list-folder-children.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import {
  CreateFolderResponseDto,
  DeleteFileResponseDto,
  ListFolderChildrenResponseDto,
  MoveFileResponseDto,
  RenameFileResponseDto,
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
  @Get('folders/:folderId/children')
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

  @UseGuards(JwtAuthGuard)
  @Put(':fileId/rename')
  async renameFile(
    @CurrentUser() authUser: AuthUser,
    @Param('fileId') fileId: string,
    @Body() body: RenameFileDto,
  ): Promise<RenameFileResponseDto> {
    const file = await this.fileService.renameFile(authUser, fileId, body.name);
    return plainToInstance(RenameFileResponseDto, file, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard)
  @Put(':fileId/move')
  async moveFile(
    @CurrentUser() authUser: AuthUser,
    @Param('fileId') fileId: string,
    @Body() body: MoveFileDto,
  ): Promise<MoveFileResponseDto> {
    const file = await this.fileService.moveFile(authUser, fileId, body.parentId ?? null);
    return plainToInstance(MoveFileResponseDto, file, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':fileId')
  async deleteFile(
    @CurrentUser() authUser: AuthUser,
    @Param('fileId') fileId: string,
  ): Promise<DeleteFileResponseDto> {
    const file = await this.fileService.deleteFile(authUser, fileId);
    return plainToInstance(DeleteFileResponseDto, file, { excludeExtraneousValues: true });
  }
}
