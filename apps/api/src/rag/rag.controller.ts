import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RagService } from './rag.service';

class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @UseGuards(JwtAuthGuard)
  @Post('ask')
  async askQuestion(
    @CurrentUser() authUser: AuthUser,
    @Body() body: AskQuestionDto,
  ) {
    return this.ragService.askQuestion(authUser, body.question, {
      fileIds: body.fileIds,
      limit: body.limit,
    });
  }
}
