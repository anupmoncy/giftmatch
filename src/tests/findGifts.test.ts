import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  createClient: vi.fn(),
  responsesCreate: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  inserts: [] as Array<{ table: string; payload: unknown }>,
  orderLog: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockState.createClient,
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function OpenAI() {
    return {
    responses: {
      create: mockState.responsesCreate,
    },
    };
  }),
}));

const catalogItems = [
  {
    id: 'catalog-1',
    name: 'Studio Journal',
    description: 'A guided creative journal for daily sketches and memories.',
    price: 24,
    image_url: 'https://example.com/journal.jpg',
    brand: 'Paper Co',
    category: 'Stationery',
    subcategory: 'Journals',
  },
  {
    id: 'catalog-2',
    name: 'Trail Mug',
    description: 'Durable insulated mug for outdoor coffee and travel.',
    price: 49,
    image_url: null,
    brand: 'North Goods',
    category: 'Outdoors',
    subcategory: 'Drinkware',
  },
];

const validModelOutput = {
  summary: 'These gifts balance practical use with a personal spark. The top pick feels especially tailored.',
  recommendations: [
    {
      catalog_item_id: 'catalog-1',
      rank: 1,
      score: 94,
      reason: 'It gives them a simple creative ritual.',
      gift_angle: 'Creative daily reflection',
      confidence: 'high',
    },
    {
      catalog_item_id: 'catalog-2',
      rank: 2,
      score: 87,
      reason: 'It supports cozy adventures without being fussy.',
      gift_angle: 'Useful adventure companion',
      confidence: 'medium',
    },
  ],
};

const answers = {
  recipient: 'friend',
  personality: 'creative',
  budget: '25-50',
  freeText: 'They love sketching on weekend hikes.',
};

function createThenableQuery(result: unknown) {
  const query = {
    select: vi.fn(),
    order: mockState.order,
    limit: mockState.limit,
    gte: mockState.gte,
    lte: mockState.lte,
    then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
      mockState.orderLog.push('catalog');
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lte.mockReturnValue(query);

  return query;
}

function createInsertQuery(table: string, id: string) {
  const query = {
    insert: vi.fn((payload: unknown) => {
      mockState.inserts.push({ table, payload });
      return query;
    }),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
  };

  query.select.mockReturnValue(query);

  return query;
}

function createSupabaseClient(catalogResult: unknown = { data: catalogItems, error: null }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'catalog') {
        return createThenableQuery(catalogResult);
      }

      if (table === 'quiz_runs') {
        return createInsertQuery(table, 'quiz-run-1');
      }

      if (table === 'recommendation_runs') {
        return createInsertQuery(table, 'recommendation-run-1');
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

async function importService() {
  const module = await import('../services/findGifts.js');
  return module.findGifts;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.inserts = [];
  mockState.orderLog = [];
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.OPENAI_API_KEY = 'openai-key';
  delete process.env.OPENAI_MODEL;

  mockState.responsesCreate.mockImplementation(async () => {
    mockState.orderLog.push('openai');
    return { output_text: JSON.stringify(validModelOutput) };
  });

  mockState.createClient.mockReturnValue(createSupabaseClient());
});

describe('findGifts', () => {
  it.each([
    ['under-25', { gte: undefined, lte: 25, persistedBudget: 25 }],
    ['25-50', { gte: 25, lte: 50, persistedBudget: 50 }],
    ['50to100', { gte: 50, lte: 100, persistedBudget: 100 }],
    ['splurge', { gte: 200, lte: undefined, persistedBudget: null }],
    ['flexible', { gte: undefined, lte: undefined, persistedBudget: null }],
  ])('maps budget filtering for %s', async (budget, expected) => {
    const findGifts = await importService();

    await findGifts({ ...answers, budget }, { userId: 'user-1' });

    if (expected.gte === undefined) {
      expect(mockState.gte).not.toHaveBeenCalled();
    } else {
      expect(mockState.gte).toHaveBeenCalledWith('price', expected.gte);
    }

    if (expected.lte === undefined) {
      expect(mockState.lte).not.toHaveBeenCalled();
    } else {
      expect(mockState.lte).toHaveBeenCalledWith('price', expected.lte);
    }

    expect(mockState.inserts[0]).toMatchObject({
      table: 'quiz_runs',
      payload: { budget: expected.persistedBudget },
    });
  });

  it('fetches catalog items from Supabase before calling OpenAI', async () => {
    const findGifts = await importService();

    await findGifts(answers, { userId: 'user-1' });

    expect(mockState.orderLog).toEqual(['catalog', 'openai']);
    expect(mockState.limit).toHaveBeenCalledWith(1000);
  });

  it('returns an empty result without calling OpenAI when the budget has no catalog matches', async () => {
    mockState.createClient.mockReturnValueOnce(createSupabaseClient({ data: [], error: null }));
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(mockState.responsesCreate).not.toHaveBeenCalled();
    expect(result.recommendations).toEqual([]);
    expect(result.summary).toContain('could not find catalog items inside that budget');
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        model: 'gpt-4o-mini',
        ranked_output: expect.objectContaining({ recommendations: [] }),
      }),
    });
  });

  it('uses OPENAI_MODEL and falls back to gpt-4o-mini', async () => {
    const findGifts = await importService();

    await findGifts(answers, { userId: 'user-1' });
    expect(mockState.responsesCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' }),
    );

    process.env.OPENAI_MODEL = 'gpt-test-model';
    await findGifts(answers, { userId: 'user-1' });
    expect(mockState.responsesCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'gpt-test-model' }),
    );
  });

  it('sends recipient, personality, budget, freeText, and catalog descriptions to OpenAI', async () => {
    const findGifts = await importService();

    await findGifts(answers, { userId: 'user-1' });

    const prompt = mockState.responsesCreate.mock.calls[0][0].input as string;
    expect(prompt).toContain(answers.recipient);
    expect(prompt).toContain(answers.personality);
    expect(prompt).toContain(answers.budget);
    expect(prompt).toContain(answers.freeText);
    expect(prompt).toContain(catalogItems[0].description);
    expect(prompt).toContain(catalogItems[1].description);
  });

  it('parses and validates structured model output fields', async () => {
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(result.recommendations).toHaveLength(2);
    for (const item of result.recommendations) {
      expect(item).toEqual(
        expect.objectContaining({
          catalog_item_id: expect.any(String),
          rank: expect.any(Number),
          score: expect.any(Number),
          reason: expect.any(String),
          gift_angle: expect.any(String),
          confidence: expect.stringMatching(/^(high|medium|low)$/),
          item: expect.objectContaining({ id: item.catalog_item_id }),
        }),
      );
    }
  });

  it('inserts quiz_runs and recommendation_runs with the expected fields', async () => {
    const findGifts = await importService();

    await findGifts(answers, { userId: 'user-1' });

    expect(mockState.inserts[0]).toEqual({
      table: 'quiz_runs',
      payload: {
        user_id: 'user-1',
        recipient: answers.recipient,
        personality: answers.personality,
        budget: 50,
        free_text: answers.freeText,
      },
    });
    expect(mockState.inserts[1]).toEqual({
      table: 'recommendation_runs',
      payload: {
        quiz_run_id: 'quiz-run-1',
        model: 'gpt-4o-mini',
        prompt_version: 'giftmatch-rank-v1',
        ranked_output: validModelOutput,
        summary: validModelOutput.summary,
      },
    });
  });

  it('returns a valid GiftResult shape', async () => {
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(result).toEqual({
      quizRunId: 'quiz-run-1',
      recommendationRunId: 'recommendation-run-1',
      promptVersion: 'giftmatch-rank-v1',
      model: 'gpt-4o-mini',
      summary: validModelOutput.summary,
      recommendations: expect.any(Array),
    });
  });

  it('throws a descriptive error when OpenAI returns malformed JSON', async () => {
    mockState.responsesCreate.mockResolvedValueOnce({ output_text: '{not-json' });
    const findGifts = await importService();

    await expect(findGifts(answers, { userId: 'user-1' })).rejects.toThrow(
      /OpenAI returned.*JSON recommendation response/i,
    );
    expect(mockState.inserts[0]).toEqual({
      table: 'quiz_runs',
      payload: {
        user_id: 'user-1',
        recipient: answers.recipient,
        personality: answers.personality,
        budget: 50,
        free_text: answers.freeText,
      },
    });
    expect(mockState.inserts[1]).toEqual({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        quiz_run_id: 'quiz-run-1',
        model: 'gpt-4o-mini',
        prompt_version: 'giftmatch-rank-v1',
        summary: expect.stringContaining('Discovery failed during model_output_parse'),
        ranked_output: expect.objectContaining({
          status: 'error',
          stage: 'model_output_parse',
          answers,
          error: expect.objectContaining({
            name: 'ModelOutputParseError',
            message: 'OpenAI returned a non-JSON recommendation response',
            stack: expect.any(String),
          }),
        }),
      }),
    });
  });

  it('handles OpenAI 429 errors with the catalog fallback', async () => {
    mockState.responsesCreate.mockRejectedValueOnce({ status: 429, message: 'Too many requests' });
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(result.model).toBe('catalog-rate-limit-fallback-v1');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        model: 'catalog-rate-limit-fallback-v1',
        prompt_version: 'giftmatch-rank-v1',
        ranked_output: expect.objectContaining({ recommendations: expect.any(Array) }),
      }),
    });
  });

  it('falls back to catalog ranking when OpenAI returns an unknown catalog item id', async () => {
    mockState.responsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        ...validModelOutput,
        recommendations: [
          {
            ...validModelOutput.recommendations[0],
            catalog_item_id: 'not-in-this-catalog',
          },
        ],
      }),
    });
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(result.model).toBe('catalog-rate-limit-fallback-v1');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(
      result.recommendations.every((item) =>
        catalogItems.some((catalog) => catalog.id === item.catalog_item_id),
      ),
    ).toBe(true);
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        model: 'catalog-rate-limit-fallback-v1',
        ranked_output: expect.objectContaining({ recommendations: expect.any(Array) }),
      }),
    });
  });
});
