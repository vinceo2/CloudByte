import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class FolderResponseDto {
  @Expose()
  id!: string;

  @Expose()
  ownerId!: string;

  @Expose()
  parentId!: string | null;

  @Expose()
  name!: string;

  @Expose()
  isFolder!: boolean;

  @Expose()
  mimeType?: string | null;

  @Expose()
  @Transform(({ value }) => Number(value) || 0)
  sizeBytes!: number;

  @Expose()
  previewS3Key?: string | null;

  @Expose()
  @Transform(({ value }) => (value instanceof Date ? value.toISOString() : value))
  createdAt!: string;

  @Expose()
  @Transform(({ value }) => (value instanceof Date ? value.toISOString() : value))
  updatedAt!: string;
}

export class CreateFolderResponseDto extends FolderResponseDto {}

export class RenameFileResponseDto extends FolderResponseDto {}

export class MoveFileResponseDto extends FolderResponseDto {}

export class DeleteFileResponseDto extends FolderResponseDto {}

export class ListFolderChildrenResponseDto {
  @Expose()
  @Type(() => FolderResponseDto)
  children!: FolderResponseDto[];
}
