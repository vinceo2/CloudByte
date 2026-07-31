import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum FolderChildrenOrderBy {
  CreatedAt = 'createdAt',
  Name = 'name',
  MimeType = 'mimeType',
  SizeBytes = 'sizeBytes',
  UpdatedAt = 'updatedAt',
}

export class ListFolderChildrenDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsEnum(FolderChildrenOrderBy)
  orderby?: FolderChildrenOrderBy;
}
