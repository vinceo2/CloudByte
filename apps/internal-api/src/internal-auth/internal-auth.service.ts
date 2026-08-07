import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InternalAuthService {
  constructor(private readonly prisma: PrismaService) {}

  hashSecret(secret: string) {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  async validateClient(clientId: string, secret: string) {
    const client = await this.prisma.internalClient.findUnique({
      where: { clientId },
    });

    if (!client || !client.isActive) {
      throw new UnauthorizedException('Invalid internal client');
    }

    const providedHash = this.hashSecret(secret);

    if (providedHash !== client.secretHash) {
      throw new UnauthorizedException('Invalid internal client secret');
    }

    return {
      clientId: client.clientId,
      name: client.name,
      permissions: client.permissions,
    };
  }

}
