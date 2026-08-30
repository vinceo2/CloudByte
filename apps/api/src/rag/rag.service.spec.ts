import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../prisma/prisma.service';
import { VectorSearchService } from './vector-search.service';
import { McpServerService } from './mcp-server.service';

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'The plan is to ship in two weeks.',
    }),
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
}));

describe('RagService', () => {
  let service: RagService;
  let prisma: {
    user: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let mcpServerService: {
    listUserFiles: jest.Mock;
    buildContextSummary: jest.Mock;
  };

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-123' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          fileId: 'file-1',
          sourceFileName: 'roadmap.md',
          chunkText: 'The team release schedule says we will release in two weeks.',
          score: 0.93,
        },
        {
          fileId: 'file-2',
          sourceFileName: 'other.md',
          chunkText: 'This note has nothing to do with the question at all.',
          score: 0.21,
        },
      ]),
    };

    mcpServerService = {
      listUserFiles: jest.fn().mockResolvedValue([
        { id: 'file-1', name: 'roadmap.md', sizeBytes: 1200 },
        { id: 'file-2', name: 'other.md', sizeBytes: 900 },
      ]),
      buildContextSummary: jest.fn().mockResolvedValue('Available files: roadmap.md, other.md'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        VectorSearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: McpServerService, useValue: mcpServerService },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  it('filters to the authenticated user and returns answer + sources', async () => {
    const result = await service.askQuestion(
      { cognitoSub: 'abc', email: 'user@example.com' },
      'When is the release happening?',
      {},
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: 'abc' },
      select: { id: true },
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(mcpServerService.buildContextSummary).toHaveBeenCalledWith(
      expect.objectContaining({ cognitoSub: 'abc' }),
      10,
    );
    expect(result.answer).toContain('two weeks');
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileName: 'roadmap.md' }),
    ]));
    expect(result.sources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fileName: 'other.md' }),
    ]));
  });
});
