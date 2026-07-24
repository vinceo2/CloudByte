import { Injectable } from '@nestjs/common';
import { UserTier as PrismaUserTier } from '@prisma/client';
import { UserTier, TIER_STORAGE_LIMITS } from '@cloudbyte/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './current-user.decorator';

const tierMap: Record<PrismaUserTier, UserTier> = {
  FREE: UserTier.Free,
  PRO: UserTier.Pro,
  ENTERPRISE: UserTier.Enterprise,
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateUser(authUser: AuthUser) {
    const user = await this.prisma.user.upsert({
      where: { cognitoSub: authUser.cognitoSub },
      update: { email: authUser.email },
      create: {
        cognitoSub: authUser.cognitoSub,
        email: authUser.email,
      },
    });

    const tierKey = tierMap[user.tier];

    return {
      id: user.id,
      email: user.email,
      tier: tierKey,
      storageUsedBytes: Number(user.storageUsedBytes),
      storageLimitBytes: TIER_STORAGE_LIMITS[tierKey],
    };
  }
}
