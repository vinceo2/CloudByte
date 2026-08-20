import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { JwtAuthGuard } from './../src/auth/jwt-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const authenticatedUser = {
    cognitoSub: 'user-123',
    email: 'user@example.com',
  };

  async function seedUser(cognitoSub: string, email: string) {
    return prisma.user.upsert({
      where: { cognitoSub },
      update: { email },
      create: { cognitoSub, email },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$transaction([
      prisma.share.deleteMany(),
      prisma.file.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const request = context.switchToHttp().getRequest();
          request.user = authenticatedUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await prisma.$transaction([
      prisma.share.deleteMany(),
      prisma.file.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('POST /files/folders creates a folder for the authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/folders')
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'Root folder' })
      .expect(201);

    const createdUser = await prisma.user.findUnique({ where: { cognitoSub: authenticatedUser.cognitoSub } });

    expect(response.body).toMatchObject({
      name: 'Root folder',
      isFolder: true,
      ownerId: createdUser!.id,
    });

    const createdFolder = await prisma.file.findFirst({
      where: { ownerId: createdUser!.id, name: 'Root folder', isFolder: true },
    });

    expect(createdFolder).not.toBeNull();
  });

  it('POST /files/folders rejects an invalid parent folder', async () => {
    const otherUser = await seedUser('other-user-123', 'other@example.com');
    await prisma.file.create({
      data: {
        ownerId: otherUser.id,
        name: 'Other root',
        isFolder: true,
      },
    });

    await request(app.getHttpServer())
      .post('/files/folders')
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'Nested folder', parentId: 'does-not-match' })
      .expect(400);
  });

  it('GET /files/folders/:folderId/children returns children for a valid folder', async () => {
    const user = await seedUser(authenticatedUser.cognitoSub, authenticatedUser.email);
    const folder = await prisma.file.create({
      data: {
        ownerId: user.id,
        name: 'Root folder',
        isFolder: true,
      },
    });

    await prisma.file.create({
      data: {
        ownerId: user.id,
        parentId: folder.id,
        name: 'nested.txt',
        isFolder: false,
        mimeType: 'text/plain',
        sizeBytes: 123,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/files/folders/${folder.id}/children?page=1&orderby=createdAt`)
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.children).toHaveLength(1);
    expect(response.body.children[0]).toMatchObject({
      name: 'nested.txt',
      isFolder: false,
      parentId: folder.id,
    });
  });

  it('PUT /files/:fileId/rename rejects files owned by another user', async () => {
    const otherUser = await seedUser('other-user-456', 'other2@example.com');
    const file = await prisma.file.create({
      data: {
        ownerId: otherUser.id,
        name: 'foreign.txt',
        isFolder: false,
        mimeType: 'text/plain',
        sizeBytes: 20,
      },
    });

    await request(app.getHttpServer())
      .put(`/files/${file.id}/rename`)
      .set('Authorization', 'Bearer test-token')
      .send({ name: 'hijacked.txt' })
      .expect(400);
  });

  it('PUT /files/:fileId/move accepts a valid parent folder move', async () => {
    const user = await seedUser(authenticatedUser.cognitoSub, authenticatedUser.email);
    const folder = await prisma.file.create({
      data: { ownerId: user.id, name: 'Target folder', isFolder: true },
    });
    const file = await prisma.file.create({
      data: { ownerId: user.id, name: 'moved-file.txt', isFolder: false, mimeType: 'text/plain', sizeBytes: 40 },
    });

    const response = await request(app.getHttpServer())
      .put(`/files/${file.id}/move`)
      .set('Authorization', 'Bearer test-token')
      .send({ parentId: folder.id })
      .expect(200);

    expect(response.body).toMatchObject({
      id: file.id,
      parentId: folder.id,
      name: 'moved-file.txt',
    });

    const moved = await prisma.file.findUnique({ where: { id: file.id } });
    expect(moved?.parentId).toBe(folder.id);
  });

  it('DELETE /files/:fileId rejects deleting another user\'s file', async () => {
    const otherUser = await seedUser('other-user-789', 'other3@example.com');
    const file = await prisma.file.create({
      data: {
        ownerId: otherUser.id,
        name: 'steal-me.txt',
        isFolder: false,
        mimeType: 'text/plain',
        sizeBytes: 100,
      },
    });

    await request(app.getHttpServer())
      .delete(`/files/${file.id}`)
      .set('Authorization', 'Bearer test-token')
      .expect(400);

    const stillExists = await prisma.file.findUnique({ where: { id: file.id } });
    expect(stillExists).not.toBeNull();
  });

  it('GET /files/search returns matching file results for the authenticated user', async () => {
    const user = await seedUser(authenticatedUser.cognitoSub, authenticatedUser.email);
    await prisma.file.create({
      data: {
        ownerId: user.id,
        name: 'report.pdf',
        isFolder: false,
        mimeType: 'application/pdf',
        sizeBytes: 245,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/files/search?filename=report&page=1&orderby=createdAt')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      name: 'report.pdf',
      isFolder: false,
      ownerId: user.id,
    });
  });
});
