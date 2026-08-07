import { Module } from '@nestjs/common';
import { InternalAuthService } from './internal-auth.service';
import { InternalAuthGuard } from './internal-auth.guard';

@Module({
  providers: [InternalAuthService, InternalAuthGuard],
  exports: [InternalAuthGuard, InternalAuthService],
})
export class InternalAuthModule {}
