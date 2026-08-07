import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { InternalAuthService } from './internal-auth.service';

interface InternalClientRequest extends Request {
  internalClient?: {
    clientId: string;
    name: string;
    permissions: string[];
  };
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly authService: InternalAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InternalClientRequest>();
    const clientId = request.header('x-internal-client-id');
    const secret = request.header('x-internal-client-secret');

    if (typeof clientId !== 'string' || typeof secret !== 'string') {
      throw new UnauthorizedException('Missing internal client credentials');
    }

    const identity = await this.authService.validateClient(clientId, secret);

    request['internalClient'] = identity;
    return true;
  }
}
