import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module';
import { InternalServiceController } from './internal-service.controller';
import { InternalServiceService } from './internal-service.service';

@Module({
  imports: [InternalAuthModule],
  controllers: [InternalServiceController],
  providers: [InternalServiceService],
})
export class InternalServiceModule {}
