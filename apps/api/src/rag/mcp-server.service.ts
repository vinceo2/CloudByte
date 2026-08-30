import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export type UserFileSummary = {
  id: string;
  name: string;
  sizeBytes: number;
  s3Key?: string;
  uploadStatus?: string;
};

@Injectable()
export class McpServerService {
  constructor(private readonly prisma: PrismaService) {}

  async listUserFiles(authUser: AuthUser, limit: number = 10): Promise<UserFileSummary[]> {
    const user = await this.prisma.user.findUnique({
      where: { cognitoSub: authUser.cognitoSub },
      select: { id: true },
    });

    if (!user) {
      return [];
    }

    const files = await this.prisma.file.findMany({
      where: {
        ownerId: user.id,
        isFolder: false,
      },
      select: {
        id: true,
        name: true,
        sizeBytes: true,
        s3Key: true,
        uploadStatus: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return files.map((file) => ({
      id: file.id,
      name: file.name,
      sizeBytes: Number(file.sizeBytes ?? 0),
      s3Key: file.s3Key ?? undefined,
      uploadStatus: file.uploadStatus ?? undefined,
    }));
  }

  async buildContextSummary(authUser: AuthUser, limit: number = 10): Promise<string> {
    const files = await this.listUserFiles(authUser, limit);

    if (!files.length) {
      return 'No files are available for this user yet.';
    }

    return `Available files: ${files.map((file) => file.name).join(', ')}`;
  }
}
