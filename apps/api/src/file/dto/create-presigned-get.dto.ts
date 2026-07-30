import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreatePresignedGetDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  keys!: string[];
}
