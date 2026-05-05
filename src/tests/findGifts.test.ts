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
  eliminated_catalog_item_ids: [],
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
  delete process.env.ENABLE_OPENAI_GUARDRAIL_REVIEW;

  mockState.responsesCreate.mockImplementation(async (request) => {
    mockState.orderLog.push('openai');
    if (request.text?.format?.name === 'giftmatch_guardrail_review') {
      return {
        output_text: JSON.stringify({
          recommendations: validModelOutput.recommendations.map((recommendation) => ({
            catalog_item_id: recommendation.catalog_item_id,
            approved: true,
            reason: 'Appropriate fit for the selected context.',
          })),
        }),
      };
    }
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
    expect(mockState.limit).toHaveBeenCalledWith(500);
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

  it('uses quiz selections to narrow catalog candidates before LLM free-text ranking', async () => {
    const matchingCatalog = Array.from({ length: 7 }, (_, index) => ({
      id: `matching-${index}`,
      name: `Creative Friend Gift ${index}`,
      description: 'A gift tuned for friend recipients and creative personalities with journaling cues.',
      price: 30 + index,
      image_url: null,
      brand: 'Match Co',
      category: 'Art',
      subcategory: 'Journals',
    }));
    const unrelatedCatalog = Array.from({ length: 7 }, (_, index) => ({
      id: `unrelated-${index}`,
      name: `Practical Parent Gift ${index}`,
      description: 'A gift tuned for parent recipients and practical personalities with kitchen cues.',
      price: 30 + index,
      image_url: null,
      brand: 'Other Co',
      category: 'Kitchen',
      subcategory: 'Tools',
    }));
    mockState.createClient.mockReturnValueOnce(
      createSupabaseClient({
        data: [...matchingCatalog, ...unrelatedCatalog],
        error: null,
      }),
    );
    mockState.responsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: 'These picks use the extra context to choose from the quiz-filtered catalog. They avoid items that do not fit the note.',
        recommendations: matchingCatalog.slice(0, 5).map((item, index) => ({
          catalog_item_id: item.id,
          rank: index + 1,
          score: 95 - index,
          reason: 'The free text keeps this in the strongest match set.',
          gift_angle: 'Free-text refined pick',
          confidence: 'high',
        })),
      }),
    });
    const findGifts = await importService();

    await findGifts(answers, { userId: 'user-1' });

    const prompt = mockState.responsesCreate.mock.calls[0][0].input as string;
    expect(prompt).toContain('Free text is the strongest signal');
    expect(prompt).toContain(answers.freeText);
    expect(prompt).toContain('matching-0');
    expect(prompt).not.toContain('unrelated-0');
  });

  it('uses free text to eliminate irrelevant quiz-compatible candidates before ranking', async () => {
    const artCatalog = Array.from({ length: 6 }, (_, index) => ({
      id: `art-${index}`,
      name: `Art Kit ${index}`,
      description: 'A creative friend gift for art, painting, sketching, and craft nights.',
      price: 30 + index,
      image_url: null,
      brand: 'Art Co',
      category: 'Art',
      subcategory: 'Painting',
    }));
    const skincareCatalog = Array.from({ length: 6 }, (_, index) => ({
      id: `skincare-${index}`,
      name: `Skincare Set ${index}`,
      description: 'A creative friend gift with skincare, beauty, mask, balm, and pampering cues.',
      price: 30 + index,
      image_url: null,
      brand: 'Glow Co',
      category: 'Beauty',
      subcategory: 'Skincare',
    }));
    mockState.createClient.mockReturnValueOnce(
      createSupabaseClient({
        data: [...skincareCatalog, ...artCatalog],
        error: null,
      }),
    );
    mockState.responsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: 'The free-text art cue pushed the creative supplies to the front. Beauty items were left out because they do not fit the requested hobby.',
        recommendations: artCatalog.slice(0, 5).map((item, index) => ({
          catalog_item_id: item.id,
          rank: index + 1,
          score: 98 - index,
          reason: 'It directly supports the requested art interest.',
          gift_angle: 'Art hobby pick',
          confidence: 'high',
        })),
      }),
    });
    const findGifts = await importService();

    await findGifts(
      {
        ...answers,
        freeText: 'she asked for art',
      },
      { userId: 'user-1' },
    );

    const prompt = mockState.responsesCreate.mock.calls[0][0].input as string;
    expect(prompt).toContain('Free text is the strongest signal');
    expect(prompt).toContain('eliminate skincare and beauty items');
    expect(prompt).toContain('art-0');
    expect(prompt).not.toContain('skincare-0');
  });

  it('has the LLM eliminate superficially matching gaming accessories for travel requests', async () => {
    const travelCatalog = Array.from({ length: 6 }, (_, index) => ({
      id: `travel-${index}`,
      name: `Travel Organizer ${index}`,
      description: 'A practical friend gift for travel, trips, luggage, flights, and weekend packing.',
      price: 30 + index,
      image_url: null,
      brand: 'Pack Co',
      category: 'Travel',
      subcategory: 'Organization',
    }));
    const gamingCatalog = [
      {
        id: 'xbox-controller',
        name: 'Travel Xbox Controller Kit',
        description: 'A practical friend gift for travel-labeled gaming, Xbox consoles, PC games, and controller setups.',
        price: 45,
        image_url: null,
        brand: 'Microsoft Xbox',
        category: 'Gaming',
        subcategory: 'Controller',
      },
      {
        id: 'steelseries-pad',
        name: 'SteelSeries Travel Mouse Pad Kit',
        description: 'A practical friend gift for travel-labeled gaming, SteelSeries gear, mouse pad comfort, and PC setups.',
        price: 35,
        image_url: null,
        brand: 'SteelSeries',
        category: 'Gaming',
        subcategory: 'PC Accessory',
      },
    ];
    mockState.createClient.mockReturnValueOnce(
      createSupabaseClient({
        data: [...gamingCatalog, ...travelCatalog],
        error: null,
      }),
    );
    mockState.responsesCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        summary: 'The travel context points to packing and trip helpers. Gaming accessories were excluded because no gaming need was stated.',
        eliminated_catalog_item_ids: ['xbox-controller', 'steelseries-pad'],
        recommendations: travelCatalog.slice(0, 5).map((item, index) => ({
          catalog_item_id: item.id,
          rank: index + 1,
          score: 97 - index,
          reason: 'It directly supports travel and packing.',
          gift_angle: 'Travel helper',
          confidence: 'high',
        })),
      }),
    });
    const findGifts = await importService();

    await findGifts(
      {
        ...answers,
        personality: 'practical',
        freeText: 'for travel',
      },
      { userId: 'user-1' },
    );

    const prompt = mockState.responsesCreate.mock.calls[0][0].input as string;
    expect(prompt).toContain('eliminated_catalog_item_ids');
    expect(prompt).toContain('travel-0');
    expect(prompt).toContain('xbox-controller');
    expect(prompt).toContain('steelseries-pad');
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        ranked_output: expect.objectContaining({
          eliminated_catalog_item_ids: ['xbox-controller', 'steelseries-pad'],
        }),
      }),
    });
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

  it('keeps valid catalog image URLs and fills missing images in the backend', async () => {
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });
    const studioJournal = result.recommendations.find((gift) => gift.catalog_item_id === 'catalog-1');
    const trailMug = result.recommendations.find((gift) => gift.catalog_item_id === 'catalog-2');

    expect(studioJournal?.item.image_url).toBe('https://example.com/journal.jpg');
    expect(trailMug?.item.image_url).toMatch(/^data:image\/svg\+xml/);
  });

  it('replaces unreliable source.unsplash catalog image URLs in the backend', async () => {
    mockState.createClient.mockReturnValueOnce(
      createSupabaseClient({
        data: [
          {
            ...catalogItems[0],
            image_url: 'https://source.unsplash.com/400x400/?home-&-living,storage',
          },
          catalogItems[1],
        ],
        error: null,
      }),
    );
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });
    const studioJournal = result.recommendations.find((gift) => gift.catalog_item_id === 'catalog-1');

    expect(studioJournal?.item.image_url).toMatch(/^data:image\/svg\+xml/);
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
      debug_timings: {
        catalog_fetch: expect.any(Number),
        prompt_build: expect.any(Number),
        openai_call: expect.any(Number),
        parse_validate: expect.any(Number),
        db_persist: expect.any(Number),
        total: expect.any(Number),
      },
    });
  });

  it('filters recommendations rejected by the LLM guardrail review', async () => {
    process.env.ENABLE_OPENAI_GUARDRAIL_REVIEW = 'true';
    mockState.responsesCreate
      .mockImplementationOnce(async () => {
        mockState.orderLog.push('openai');
        return { output_text: JSON.stringify(validModelOutput) };
      })
      .mockImplementationOnce(async () => {
        mockState.orderLog.push('openai');
        return {
          output_text: JSON.stringify({
            recommendations: [
              {
                catalog_item_id: 'catalog-1',
                approved: true,
                reason: 'Still matches the creative friend context.',
              },
              {
                catalog_item_id: 'catalog-2',
                approved: false,
                reason: 'Less relevant to the sketching context.',
              },
            ],
          }),
        };
      });
    const findGifts = await importService();

    const result = await findGifts(answers, { userId: 'user-1' });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].catalog_item_id).toBe('catalog-1');
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        ranked_output: expect.objectContaining({
          recommendations: [expect.objectContaining({ catalog_item_id: 'catalog-1' })],
        }),
      }),
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

  it('repairs model output when OpenAI returns an unknown catalog item id', async () => {
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

    expect(result.model).toBe('gpt-4o-mini');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(
      result.recommendations.every((item) =>
        catalogItems.some((catalog) => catalog.id === item.catalog_item_id),
      ),
    ).toBe(true);
    expect(mockState.inserts[1]).toMatchObject({
      table: 'recommendation_runs',
      payload: expect.objectContaining({
        model: 'gpt-4o-mini',
        ranked_output: expect.objectContaining({ recommendations: expect.any(Array) }),
      }),
    });
  });
});
