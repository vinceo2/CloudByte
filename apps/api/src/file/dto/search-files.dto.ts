import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { FolderSortOrder } from './FolderSortOrder';

export class SearchFilesDto {
  @IsString()
  filename!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsEnum(FolderSortOrder)
  orderby?: FolderSortOrder;
}
