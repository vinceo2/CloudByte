import { IsNotEmpty, IsString } from 'class-validator';

export class RenameFileDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
