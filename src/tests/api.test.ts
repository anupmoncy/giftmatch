import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  createClient: vi.fn(),
  findGifts: vi.fn(),
  warmGiftSearch: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockState.createClient,
}));

vi.mock('../../src/services/findGifts.js', () => ({
  findGifts: mockState.findGifts,
  warmGiftSearch: mockState.warmGiftSearch,
}));

type TestResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(statusCode: number): TestResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

const validAnswers = {
  recipient: 'friend',
  personality: 'creative',
  budget: '25-50',
  freeText: 'Likes hiking.',
};

const giftResult = {
  quizRunId: 'quiz-run-1',
  recommendationRunId: 'recommendation-run-1',
  promptVersion: 'giftmatch-rank-v1',
  model: 'gpt-4o-mini',
  summary: 'A warm summary.',
  recommendations: [
    {
      catalog_item_id: 'catalog-1',
      rank: 1,
      score: 92,
      reason: 'A thoughtful fit.',
      gift_angle: 'Creative comfort',
      confidence: 'high',
      item: {
        id: 'catalog-1',
        name: 'Studio Journal',
        description: 'A creative journal.',
        price: 24,
        image_url: null,
        brand: 'Paper Co',
        category: 'Stationery',
        subcategory: 'Journals',
      },
    },
  ],
};

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    json(body: unknown) {
      this.body = body;
    },
    end() {},
  };
}

async function callHandler(options: {
  headers?: Record<string, string>;
  body?: unknown;
  method?: string;
}) {
  const { default: handler } = await import('../../api/find-gifts.js');
  const res = createResponse();
  await handler(
    {
      method: options.method ?? 'POST',
      headers: options.headers ?? {},
      body: options.body ?? { answers: validAnswers },
    },
    res,
  );
  return res;
}

async function callWarmupHandler(options: {
  headers?: Record<string, string>;
  body?: unknown;
  method?: string;
}) {
  const { default: handler } = await import('../../api/find-gifts-warmup.js');
  const res = createResponse();
  await handler(
    {
      method: options.method ?? 'POST',
      headers: options.headers ?? {},
      body: options.body ?? { answers: validAnswers },
    },
    res,
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'anon-key';

  mockState.createClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  });
  mockState.findGifts.mockResolvedValue(giftResult);
  mockState.warmGiftSearch.mockResolvedValue({
    catalogCount: 20,
    selectedCatalogCount: 5,
    debug_timings: { catalog_fetch: 5, total: 6 },
  });
});

describe('POST /api/find-gifts', () => {
  it('returns 401 when no Authorization header and no demo header', async () => {
    const res = await callHandler({});

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(mockState.findGifts).not.toHaveBeenCalled();
  });

  it('returns 200 with valid GiftResult when a bearer token is valid', async () => {
    const res = await callHandler({
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.createClient().auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(mockState.findGifts).toHaveBeenCalledWith(validAnswers, { userId: 'user-1' });
    expect(res.body).toMatchObject({
      rankedGifts: giftResult.recommendations,
      summary: giftResult.summary,
    });
  });

  it('returns 400 when answers are missing or malformed', async () => {
    const res = await callHandler({
      body: { answers: { recipient: '', personality: 'creative', budget: '25-50' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing or malformed gift answers' });
    expect(mockState.findGifts).not.toHaveBeenCalled();
  });

  it('returns 500 when findGifts throws', async () => {
    mockState.findGifts.mockRejectedValueOnce(new Error('OpenAI unavailable'));

    const res = await callHandler({
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Could not find gifts' });
  });

  it('always includes rankedGifts and summary fields on success', async () => {
    const res = await callHandler({
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        rankedGifts: expect.any(Array),
        summary: expect.any(String),
      }),
    );
  });
});

describe('POST /api/find-gifts-warmup', () => {
  it('warms authenticated gift search without running recommendations', async () => {
    const res = await callWarmupHandler({
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.createClient().auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(mockState.warmGiftSearch).toHaveBeenCalledWith({ budget: validAnswers.budget });
    expect(mockState.findGifts).not.toHaveBeenCalled();
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        catalogCount: 20,
        selectedCatalogCount: 5,
      }),
    );
  });

  it('returns 401 for unauthenticated warmup requests', async () => {
    const res = await callWarmupHandler({});

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(mockState.warmGiftSearch).not.toHaveBeenCalled();
  });
});
