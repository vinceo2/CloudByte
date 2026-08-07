import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { InternalServiceService } from './internal-service.service';
import { InternalAuthGuard } from '../internal-auth/internal-auth.guard';
import { PermissionsGuard } from '../internal-auth/permissions.guard';
import { RequirePermissions } from '../internal-auth/internal-auth.decorator';

@Controller('internal-services')
@UseGuards(InternalAuthGuard, PermissionsGuard)
export class InternalServiceController {
  constructor(private readonly service: InternalServiceService) {}

  @Get()
  @RequirePermissions('services:read')
  findAll() {
    return this.service.findAll();
  }

  @Get(':slug')
  @RequirePermissions('services:read')
  findOne(@Param('slug') slug: string) {
    return this.service.findOne(slug);
  }

  @Post()
  @RequirePermissions('services:write')
  create(@Body() body: { name: string; slug: string; description?: string }) {
    return this.service.create(body);
  }

  @Put(':slug')
  @RequirePermissions('services:write')
  update(@Param('slug') slug: string, @Body() body: { name?: string; description?: string; status?: string }) {
    return this.service.update(slug, body);
  }

  @Delete(':slug')
  @RequirePermissions('services:delete')
  remove(@Param('slug') slug: string) {
    return this.service.remove(slug);
  }
}
