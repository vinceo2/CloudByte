import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InternalServiceService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.internalService.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(slug: string) {
    const service = await this.prisma.internalService.findUnique({
      where: { slug },
    });

    if (!service) {
      throw new NotFoundException(`Internal service '${slug}' was not found`);
    }

    return service;
  }

  create(data: { name: string; slug: string; description?: string }) {
    return this.prisma.internalService.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
      },
    });
  }

  async update(slug: string, data: { name?: string; description?: string; status?: string }) {
    await this.findOne(slug);

    return this.prisma.internalService.update({
      where: { slug },
      data,
    });
  }

  async remove(slug: string) {
    await this.findOne(slug);

    return this.prisma.internalService.delete({
      where: { slug },
    });
  }
}
