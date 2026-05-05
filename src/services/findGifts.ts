import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PROMPT_VERSION = 'giftmatch-rank-v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const RATE_LIMIT_FALLBACK_MODEL = 'catalog-rate-limit-fallback-v1';
const MAX_RECOMMENDATIONS = 6;

const answersSchema = z.object({
  recipient: z.string().trim().min(1),
  personality: z.string().trim().min(1),
  budget: z.string().trim().min(1),
  freeText: z.string().trim().optional().default(''),
});

const catalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.coerce.number(),
  image_url: z.string().nullable(),
  brand: z.string(),
  category: z.string(),
  subcategory: z.string(),
});

const modelRecommendationSchema = z
  .object({
    catalog_item_id: z.string(),
    rank: z.number().int().min(1).max(MAX_RECOMMENDATIONS),
    score: z.number().min(0).max(100),
    reason: z.string().min(1),
    gift_angle: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();

const modelOutputSchema = z
  .object({
    summary: z.string().min(1),
    recommendations: z.array(modelRecommendationSchema).max(MAX_RECOMMENDATIONS),
  })
  .strict();

const modelOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'recommendations'],
  properties: {
    summary: {
      type: 'string',
      minLength: 1,
    },
    recommendations: {
      type: 'array',
      maxItems: MAX_RECOMMENDATIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['catalog_item_id', 'rank', 'score', 'reason', 'gift_angle', 'confidence'],
        properties: {
          catalog_item_id: { type: 'string' },
          rank: { type: 'integer', minimum: 1, maximum: MAX_RECOMMENDATIONS },
          score: { type: 'number', minimum: 0, maximum: 100 },
          reason: { type: 'string', minLength: 1 },
          gift_angle: { type: 'string', minLength: 1 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

type CatalogItem = z.infer<typeof catalogItemSchema>;
type ModelRecommendation = z.infer<typeof modelRecommendationSchema>;

export type GiftAnswers = z.input<typeof answersSchema>;

export type GiftRecommendation = ModelRecommendation & {
  item: CatalogItem;
};

export type GiftResult = {
  quizRunId: string | null;
  recommendationRunId: string | null;
  promptVersion: string;
  model: string;
  summary: string;
  recommendations: GiftRecommendation[];
};

export type FindGiftsOptions = {
  userId?: string;
};

type BudgetRange = {
  min?: number;
  max?: number;
  persistedBudget: number | null;
};

class ModelOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputParseError';
  }
}

function serializeUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }

  if (value instanceof Error) {
    return summarizeError(value, seen);
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknown(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, serializeUnknown(entryValue, seen)]),
  );
}

function summarizeError(error: unknown, seen = new WeakSet<object>()) {
  if (!error || typeof error !== 'object') {
    return { message: String(error) };
  }

  if (seen.has(error)) {
    return { message: '[Circular]' };
  }

  seen.add(error);

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    type?: unknown;
    stack?: unknown;
    cause?: unknown;
    response?: unknown;
    error?: unknown;
  };

  const detailEntries = Object.entries(candidate)
    .filter(
      ([key, value]) =>
        !['name', 'message', 'code', 'status', 'type', 'stack', 'cause', 'response', 'error'].includes(
          key,
        ) && value !== undefined,
    )
    .map(([key, value]) => [key, serializeUnknown(value, seen)]);

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    status: typeof candidate.status === 'number' ? candidate.status : undefined,
    type: typeof candidate.type === 'string' ? candidate.type : undefined,
    stack: typeof candidate.stack === 'string' ? candidate.stack : undefined,
    cause: serializeUnknown(candidate.cause, seen),
    response: serializeUnknown(candidate.response, seen),
    error: serializeUnknown(candidate.error, seen),
    details: Object.fromEntries(detailEntries),
  };
}

function getEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getOpenAIModel() {
  return getEnv('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    status?: number;
    code?: string | null;
    type?: string | null;
    error?: {
      code?: string | null;
      type?: string | null;
    };
  };

  return (
    candidate.status === 429 ||
    candidate.code === 'insufficient_quota' ||
    candidate.type === 'insufficient_quota' ||
    candidate.error?.code === 'insufficient_quota' ||
    candidate.error?.type === 'insufficient_quota'
  );
}

function isModelOutputParseError(error: unknown): boolean {
  return error instanceof ModelOutputParseError;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseModelOutputContent(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent);
  } catch {
    const jsonObject = extractJsonObject(rawContent);

    if (!jsonObject) {
      throw new ModelOutputParseError('OpenAI returned a non-JSON recommendation response');
    }

    try {
      return JSON.parse(jsonObject);
    } catch {
      throw new ModelOutputParseError('OpenAI returned malformed JSON recommendation response');
    }
  }
}

function parseBudgetRange(budget: string): BudgetRange {
  const normalized = budget.trim().toLowerCase();
  const numbers = Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g), (match) => Number(match[0]));

  if (normalized.includes('flex')) {
    return { persistedBudget: null };
  }

  if (normalized.includes('under') || normalized.includes('below') || normalized.includes('<')) {
    const max = numbers[0] ?? 25;
    return { max, persistedBudget: max };
  }

  if (normalized.includes('splurge')) {
    return { min: 200, persistedBudget: null };
  }

  if (numbers.length >= 2) {
    const [first, second] = numbers;
    const min = Math.min(first, second);
    const max = Math.max(first, second);
    return { min, max, persistedBudget: max };
  }

  if (numbers.length === 1) {
    return { max: numbers[0], persistedBudget: numbers[0] };
  }

  return { persistedBudget: null };
}

async function fetchBudgetFilteredCatalog(range: BudgetRange): Promise<CatalogItem[]> {
  let query = getSupabaseAdmin()
    .from('catalog')
    .select('id, name, description, price, image_url, brand, category, subcategory')
    .order('price', { ascending: true })
    .limit(40);

  if (typeof range.min === 'number') {
    query = query.gte('price', range.min);
  }

  if (typeof range.max === 'number') {
    query = query.lte('price', range.max);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return z.array(catalogItemSchema).parse(data ?? []);
}

function buildRankingPrompt(answers: z.infer<typeof answersSchema>, catalog: CatalogItem[]): string {
  return JSON.stringify(
    {
      task: 'Rank only the provided catalog items for gift fit. Do not add items. Do not filter by budget; the list is already budget-filtered in code.',
      answers,
      catalog: catalog.map((item) => ({
        catalog_item_id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        brand: item.brand,
        category: item.category,
        subcategory: item.subcategory,
      })),
      output_requirements: {
        summary: 'Exactly 2 warm sentences.',
        recommendations: `Rank up to ${MAX_RECOMMENDATIONS} of the supplied catalog items. Use ranks 1-${MAX_RECOMMENDATIONS} without duplicates.`,
      },
    },
    null,
    2,
  );
}

async function rankCatalogWithModel(
  answers: z.infer<typeof answersSchema>,
  catalog: CatalogItem[],
  model: string,
): Promise<z.infer<typeof modelOutputSchema>> {
  if (catalog.length === 0) {
    return {
      summary:
        'I could not find catalog items inside that budget yet. Try a wider budget and I can look again with more room to match their style.',
      recommendations: [],
    };
  }

  const client = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') });
  const prompt = [
    'You are GiftMatch. Rank provided catalog items for personal fit and explain the human reason. The application code owns budget filtering and persistence; you only rank the items you receive.',
    '',
    buildRankingPrompt(answers, catalog),
  ].join('\n');
  const response = await client.responses.create({
    model,
    input: prompt,
    text: {
      format: {
        type: 'json_schema',
        name: 'giftmatch_recommendations',
        strict: true,
        schema: modelOutputJsonSchema,
      },
    },
  });

  const rawContent = response.output_text;

  if (!rawContent) {
    throw new Error('OpenAI returned an empty recommendation response');
  }

  const parsedContent = parseModelOutputContent(rawContent);

  try {
    return modelOutputSchema.parse(parsedContent);
  } catch (error) {
    throw new ModelOutputParseError(
      error instanceof Error
        ? `OpenAI returned invalid recommendation response: ${error.message}`
        : 'OpenAI returned invalid recommendation response',
    );
  }
}

function getFallbackKeywords(answers: z.infer<typeof answersSchema>): string[] {
  const personality = answers.personality.toLowerCase();
  const freeTextTokens = answers.freeText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);

  const personalityKeywords: Record<string, string[]> = {
    creative: ['art', 'creative', 'design', 'craft', 'journal', 'write', 'studio'],
    practical: ['useful', 'everyday', 'home', 'kitchen', 'work', 'organizer', 'tool'],
    sentimental: ['photo', 'memory', 'personal', 'keepsake', 'cozy', 'thoughtful'],
    adventurous: ['outdoor', 'travel', 'sport', 'portable', 'durable', 'ready'],
    cozy: ['warm', 'comfort', 'home', 'soft', 'tea', 'coffee', 'relax'],
    techy: ['tech', 'smart', 'device', 'charge', 'audio', 'clever'],
  };

  return [
    answers.recipient.toLowerCase(),
    personality,
    ...(personalityKeywords[personality] ?? []),
    ...freeTextTokens,
  ];
}

function scoreCatalogItem(item: CatalogItem, keywords: string[], index: number) {
  const searchableText = [
    item.name,
    item.description,
    item.brand,
    item.category,
    item.subcategory,
  ]
    .join(' ')
    .toLowerCase();
  const matchScore = keywords.reduce(
    (score, keyword) => score + (searchableText.includes(keyword) ? 5 : 0),
    0,
  );

  return 80 + matchScore - index * 0.5;
}

function buildRateLimitFallbackOutput(
  answers: z.infer<typeof answersSchema>,
  catalog: CatalogItem[],
): z.infer<typeof modelOutputSchema> {
  const keywords = getFallbackKeywords(answers);
  const rankedItems = catalog
    .map((item, index) => ({
      item,
      score: scoreCatalogItem(item, keywords, index),
    }))
    .sort((left, right) => right.score - left.score || left.item.price - right.item.price)
    .slice(0, MAX_RECOMMENDATIONS);

  return {
    summary:
      'The smart ranker is temporarily unavailable, so I matched gifts from the live catalog with a backup ranker. These picks are budget-aware and saved to admin history so the test flow stays reviewable.',
    recommendations: rankedItems.map(({ item, score }, index) => {
      const rank = index + 1;
      const confidence = rank <= 2 ? 'high' : rank <= 4 ? 'medium' : 'low';

      return {
        catalog_item_id: item.id,
        rank,
        score: Math.max(60, Math.min(99, Math.round(score))),
        reason: `${item.name} fits a ${answers.personality} ${answers.recipient} because it lines up with ${item.subcategory.toLowerCase()} interests and stays within the selected budget.`,
        gift_angle: `${answers.personality} ${item.subcategory}`,
        confidence,
      };
    }),
  };
}

function validateRankedItems(output: z.infer<typeof modelOutputSchema>, catalog: CatalogItem[]) {
  const ids = new Set(catalog.map((item) => item.id));
  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();

  for (const recommendation of output.recommendations) {
    if (!ids.has(recommendation.catalog_item_id)) {
      throw new Error(`Model returned unknown catalog_item_id: ${recommendation.catalog_item_id}`);
    }

    if (seenIds.has(recommendation.catalog_item_id)) {
      throw new Error(`Model returned duplicate catalog_item_id: ${recommendation.catalog_item_id}`);
    }

    if (seenRanks.has(recommendation.rank)) {
      throw new Error(`Model returned duplicate rank: ${recommendation.rank}`);
    }

    seenIds.add(recommendation.catalog_item_id);
    seenRanks.add(recommendation.rank);
  }
}

async function persistRunRecord(params: {
  answers: z.infer<typeof answersSchema>;
  budgetRange: BudgetRange;
  model: string;
  rankedOutput: unknown;
  summary: string | null;
  userId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const userId = params.userId ?? getEnv('GIFTMATCH_MCP_USER_ID');

  if (!userId) {
    return { quizRunId: null, recommendationRunId: null };
  }

  const { data: quizRun, error: quizRunError } = await supabase
    .from('quiz_runs')
    .insert({
      user_id: userId,
      recipient: params.answers.recipient,
      personality: params.answers.personality,
      budget: params.budgetRange.persistedBudget,
      free_text: params.answers.freeText,
    })
    .select('id')
    .single();

  if (quizRunError) {
    throw quizRunError;
  }

  const { data: recommendationRun, error: recommendationRunError } = await supabase
    .from('recommendation_runs')
    .insert({
      quiz_run_id: quizRun.id,
      model: params.model,
      prompt_version: PROMPT_VERSION,
      ranked_output: params.rankedOutput,
      summary: params.summary,
    })
    .select('id')
    .single();

  if (recommendationRunError) {
    throw recommendationRunError;
  }

  return {
    quizRunId: quizRun.id as string,
    recommendationRunId: recommendationRun.id as string,
  };
}

async function persistRuns(params: {
  answers: z.infer<typeof answersSchema>;
  budgetRange: BudgetRange;
  model: string;
  output: z.infer<typeof modelOutputSchema>;
  userId?: string;
}) {
  return persistRunRecord({
    answers: params.answers,
    budgetRange: params.budgetRange,
    model: params.model,
    rankedOutput: params.output,
    summary: params.output.summary,
    userId: params.userId,
  });
}

async function persistFailedRun(params: {
  answers: z.infer<typeof answersSchema>;
  budgetRange: BudgetRange;
  model: string;
  stage: string;
  error: unknown;
  userId?: string;
}) {
  const errorDetails = summarizeError(params.error);
  const summary = errorDetails.message
    ? `Discovery failed during ${params.stage}: ${errorDetails.message}`
    : `Discovery failed during ${params.stage}`;

  return persistRunRecord({
    answers: params.answers,
    budgetRange: params.budgetRange,
    model: params.model,
    rankedOutput: {
      status: 'error',
      stage: params.stage,
      prompt_version: PROMPT_VERSION,
      answers: params.answers,
      budget: params.budgetRange,
      model: params.model,
      error: errorDetails,
    },
    summary,
    userId: params.userId,
  });
}

async function persistFailedRunBestEffort(params: {
  answers: z.infer<typeof answersSchema>;
  budgetRange: BudgetRange;
  model: string;
  stage: string;
  error: unknown;
  userId?: string;
}) {
  try {
    await persistFailedRun(params);
  } catch (persistError) {
    console.error('Could not persist failed discovery run', summarizeError(persistError));
  }
}

export async function findGifts(
  rawAnswers: GiftAnswers,
  options: FindGiftsOptions = {},
): Promise<GiftResult> {
  const answers = answersSchema.parse(rawAnswers);
  const budgetRange = parseBudgetRange(answers.budget);
  let model = getOpenAIModel();
  let catalog: CatalogItem[] = [];
  let output: z.infer<typeof modelOutputSchema>;
  let failedRunPersisted = false;

  try {
    catalog = await fetchBudgetFilteredCatalog(budgetRange);

    try {
      output = await rankCatalogWithModel(answers, catalog, model);
    } catch (error) {
      if (isModelOutputParseError(error)) {
        await persistFailedRunBestEffort({
          answers,
          budgetRange,
          model,
          stage: 'model_output_parse',
          error,
          userId: options.userId,
        });
        failedRunPersisted = true;
        throw error;
      }

      if (!isRateLimitError(error)) {
        await persistFailedRunBestEffort({
          answers,
          budgetRange,
          model,
          stage: 'model_ranking',
          error,
          userId: options.userId,
        });
        failedRunPersisted = true;
        throw error;
      }

      console.warn(
        'OpenAI ranking unavailable; using catalog fallback recommendations',
        summarizeError(error),
      );
      output = buildRateLimitFallbackOutput(answers, catalog);
      model = RATE_LIMIT_FALLBACK_MODEL;
    }

    validateRankedItems(output, catalog);
  } catch (error) {
    if (failedRunPersisted) {
      throw error;
    }

    if (catalog.length === 0) {
      await persistFailedRunBestEffort({
        answers,
        budgetRange,
        model,
        stage: 'catalog_fetch',
        error,
        userId: options.userId,
      });
    } else if (!(isModelOutputParseError(error) || isRateLimitError(error))) {
      await persistFailedRunBestEffort({
        answers,
        budgetRange,
        model,
        stage: 'recommendation_validation',
        error,
        userId: options.userId,
      });
    }

    throw error;
  }

  const runs = await persistRuns({
    answers,
    budgetRange,
    model,
    output,
    userId: options.userId,
  });

  const itemsById = new Map(catalog.map((item) => [item.id, item]));
  const recommendations = output.recommendations
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((recommendation) => {
      const item = itemsById.get(recommendation.catalog_item_id);

      if (!item) {
        throw new Error(`Validated item missing from catalog map: ${recommendation.catalog_item_id}`);
      }

      return { ...recommendation, item };
    });

  return {
    ...runs,
    promptVersion: PROMPT_VERSION,
    model,
    summary: output.summary,
    recommendations,
  };
}
