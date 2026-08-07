import { Module } from '@nestjs/common';
import { InternalServiceController } from './internal-service.controller';
import { InternalServiceService } from './internal-service.service';

@Module({
  controllers: [InternalServiceController],
  providers: [InternalServiceService],
})
export class InternalServiceModule {}
