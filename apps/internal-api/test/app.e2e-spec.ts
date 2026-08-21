import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'node:crypto';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InternalAuthService } from '../src/internal-auth/internal-auth.service';

describe('Internal API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const authHeader = {
    'x-internal-client-id': 'cloudbyte-internal',
    'x-internal-client-secret': 'super-secret',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$transaction([
      prisma.compressionJob.deleteMany(),
      prisma.file.deleteMany(),
      prisma.user.deleteMany(),
      prisma.internalClient.deleteMany(),
    ]);

    const client = await prisma.internalClient.create({
      data: {
        clientId: 'cloudbyte-internal',
        name: 'CloudByte Internal',
        secretHash: crypto.createHash('sha256').update('super-secret').digest('hex'),
        permissions: ['uploads:write', 'uploads:cleanup'],
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InternalAuthService)
      .useValue({
        validateClient: jest.fn().mockImplementation(async (clientId: string, secret: string) => {
          if (clientId !== 'cloudbyte-internal' || secret !== 'super-secret') {
            throw new Error('Invalid internal client');
          }

          return {
            clientId: client.clientId,
            name: client.name,
            permissions: client.permissions,
          };
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await prisma.$transaction([
      prisma.compressionJob.deleteMany(),
      prisma.file.deleteMany(),
      prisma.user.deleteMany(),
      prisma.internalClient.deleteMany(),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'cloudbyte-internal-api',
    });
  });

  it('POST /upload-metadata records upload processing metadata and updates storage', async () => {
    const owner = await prisma.user.create({
      data: {
        cognitoSub: 'user-123',
        email: 'user@example.com',
      },
    });

    const file = await prisma.file.create({
      data: {
        ownerId: owner.id,
        name: 'demo.pdf',
        s3Key: 'tenant-1/demo.pdf',
        sizeBytes: BigInt(2048),
        uploadStatus: 'PENDING',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/upload-metadata')
      .set(authHeader)
      .send({
        bucket: 'cloudbyte-files-dev',
        key: 'tenant-1/demo.pdf',
        sizeBytes: 2048,
        usedBytesDelta: 2048,
        uploadStatus: 'COMPLETED',
        previewS3Key: 'tenant-1/demo-preview.pdf',
        previewS3Url: 'https://example.com/demo-preview.pdf',
        eventType: 's3:ObjectCreated:Put',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      fileId: file.id,
      s3Key: 'tenant-1/demo.pdf',
      uploadStatus: 'COMPLETED',
      sizeBytes: 2048,
    });

    const updatedFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(updatedFile?.uploadStatus).toBe('COMPLETED');
    expect(updatedFile?.previewS3Key).toBe('tenant-1/demo-preview.pdf');
  });

  it('rejects missing internal auth credentials', async () => {
    await request(app.getHttpServer())
      .post('/upload-metadata')
      .send({
        bucket: 'cloudbyte-files-dev',
        key: 'tenant-1/demo.pdf',
        sizeBytes: 2048,
        usedBytesDelta: 2048,
        uploadStatus: 'COMPLETED',
      })
      .expect(401);
  });
});
