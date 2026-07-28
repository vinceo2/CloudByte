import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

export class CreatePresignedPostFileDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(0)
  sizeBytes!: number;
}

export class CreatePresignedPostDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePresignedPostFileDto)
  files!: CreatePresignedPostFileDto[];
}
