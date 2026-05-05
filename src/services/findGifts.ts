import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PROMPT_VERSION = 'giftmatch-rank-v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const RATE_LIMIT_FALLBACK_MODEL = 'catalog-rate-limit-fallback-v1';
const MAX_RECOMMENDATIONS = 5;
const CATALOG_FETCH_LIMIT = 500;
const MODEL_CATALOG_LIMIT = 24;
const CATALOG_CACHE_TTL_MS = 60_000;
const MODEL_MAX_OUTPUT_TOKENS = 800;

const answersSchema = z.object({
  recipient: z.string().trim().min(1),
  age: z.string().trim().optional().default(''),
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
  age_tags: z.array(z.string()).optional().default([]),
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
  debug_timings: StageTimings;
  fallback_mode?: boolean;
};

export type FindGiftsOptions = {
  userId?: string;
};

type BudgetRange = {
  min?: number;
  max?: number;
  persistedBudget: number | null;
};

type StageTimings = {
  catalog_fetch: number;
  prompt_build: number;
  openai_call: number;
  parse_validate: number;
  db_persist: number;
  total: number;
};

type CatalogCacheEntry = {
  expiresAt: number;
  catalog: CatalogItem[];
};

let supabaseAdminClient: SupabaseClient<any, any, any> | null = null;
let openAIClient: OpenAI | null = null;
const catalogCache = new Map<string, CatalogCacheEntry>();
const categoryImageStyles: Record<string, { from: string; to: string; accent: string }> = {
  'Beauty & Wellness': { from: '#FFF1F2', to: '#FEF3C7', accent: '#F59E0B' },
  Electronics: { from: '#EFF6FF', to: '#F5F3FF', accent: '#4F46E5' },
  'Experience & Learning': { from: '#ECFDF5', to: '#FFFBEB', accent: '#059669' },
  'Fashion & Accessories': { from: '#FDF2F8', to: '#FAE8FF', accent: '#DB2777' },
  Gaming: { from: '#F5F3FF', to: '#ECFEFF', accent: '#7C3AED' },
  'Home & Living': { from: '#FFFBEB', to: '#F7FEE7', accent: '#D97706' },
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

  if (process.env.NODE_ENV !== 'test' && supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  if (process.env.NODE_ENV !== 'test') {
    supabaseAdminClient = client;
  }

  return client;
}

function getOpenAIModel() {
  return getEnv('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;
}

function getOpenAIClient() {
  if (process.env.NODE_ENV !== 'test' && openAIClient) {
    return openAIClient;
  }

  const client = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') });

  if (process.env.NODE_ENV !== 'test') {
    openAIClient = client;
  }

  return client;
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
  };
  const text = [candidate.message, candidate.details].filter(Boolean).join(' ').toLowerCase();

  return candidate.code === '42703' || text.includes(columnName.toLowerCase());
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

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isUnreliableCatalogImageUrl(imageUrl: string | null) {
  const trimmedUrl = imageUrl?.trim();

  if (!trimmedUrl) {
    return true;
  }

  try {
    const url = new URL(trimmedUrl);
    return url.hostname === 'source.unsplash.com';
  } catch {
    return true;
  }
}

function buildCatalogImageDataUri(item: CatalogItem) {
  const style = categoryImageStyles[item.category] ?? {
    from: '#F9FAFB',
    to: '#FFF7ED',
    accent: '#F59E0B',
  };
  const title = escapeXml(item.name.slice(0, 44));
  const category = escapeXml(item.subcategory || item.category);
  const brand = escapeXml(item.brand.slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${style.from}"/><stop offset="1" stop-color="${style.to}"/></linearGradient></defs><rect width="400" height="400" rx="42" fill="url(#bg)"/><circle cx="316" cy="74" r="48" fill="${style.accent}" opacity=".14"/><circle cx="70" cy="328" r="76" fill="#fff" opacity=".58"/><rect x="54" y="62" width="292" height="276" rx="32" fill="#fff" opacity=".82"/><path d="M118 176h164v112H118z" fill="${style.accent}" opacity=".16"/><path d="M140 176c0-33 27-60 60-60s60 27 60 60" fill="none" stroke="${style.accent}" stroke-width="16" stroke-linecap="round"/><path d="M200 176v112M118 220h164" stroke="${style.accent}" stroke-width="10" opacity=".28"/><text x="200" y="47" fill="#111827" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">${brand}</text><text x="200" y="330" fill="#111827" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" text-anchor="middle">${title}</text><text x="200" y="358" fill="#6B7280" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" text-anchor="middle">${category}</text></svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeCatalogImage(item: CatalogItem): CatalogItem {
  if (!isUnreliableCatalogImageUrl(item.image_url)) {
    return {
      ...item,
      image_url: item.image_url?.trim() ?? null,
    };
  }

  return {
    ...item,
    age_tags: item.age_tags ?? [],
    image_url: buildCatalogImageDataUri(item),
  };
}

async function fetchBudgetFilteredCatalog(range: BudgetRange): Promise<CatalogItem[]> {
  const cacheKey = JSON.stringify({ min: range.min ?? null, max: range.max ?? null });

  if (process.env.NODE_ENV !== 'test') {
    const cached = catalogCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.catalog;
    }
  }

  const runCatalogQuery = (columns: string) => {
    let query = getSupabaseAdmin()
      .from('catalog')
      .select(columns)
      .order('price', { ascending: true })
      .limit(CATALOG_FETCH_LIMIT);

    if (typeof range.min === 'number') {
      query = query.gte('price', range.min);
    }

    if (typeof range.max === 'number') {
      query = query.lte('price', range.max);
    }

    return query;
  };

  let { data, error } = await runCatalogQuery(
    'id, name, description, price, image_url, brand, category, subcategory, age_tags',
  );

  if (isMissingColumnError(error, 'age_tags')) {
    ({ data, error } = await runCatalogQuery(
      'id, name, description, price, image_url, brand, category, subcategory',
    ));
  }

  if (error) {
    throw error;
  }

  const catalog = z.array(catalogItemSchema).parse(data ?? []).map(normalizeCatalogImage);

  if (process.env.NODE_ENV !== 'test') {
    catalogCache.set(cacheKey, {
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
      catalog,
    });
  }

  return catalog;
}

function buildRankingPrompt(answers: z.infer<typeof answersSchema>, catalog: CatalogItem[]): string {
  const allowedCatalogItemIds = catalog.map((item) => item.id);

  return JSON.stringify(
    {
      task: 'Rank only the provided catalog items for gift fit. Do not add items. Do not invent or reuse catalog IDs. Do not filter by budget; the list is already budget-filtered in code.',
      allowed_catalog_item_ids: allowedCatalogItemIds,
      catalog: catalog.map((item) => ({
        catalog_item_id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        brand: item.brand,
        category: item.category,
        subcategory: item.subcategory,
        age_tags: item.age_tags,
      })),
      output_requirements: {
        summary: 'Exactly 2 warm sentences.',
        recommendations: `Rank up to ${MAX_RECOMMENDATIONS} of the supplied catalog items. Use ranks 1-${MAX_RECOMMENDATIONS} without duplicates.`,
      },
      answers,
    },
  );
}

function buildOpenAIRankingPrompt(
  answers: z.infer<typeof answersSchema>,
  catalog: CatalogItem[],
): string {
  return [
    'You are GiftMatch. Rank provided catalog items for personal fit and explain the human reason. The application code owns budget filtering and persistence; you only rank the items you receive.',
    '',
    buildRankingPrompt(answers, catalog),
  ].join('\n');
}

async function requestModelRanking(prompt: string, model: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: MODEL_MAX_OUTPUT_TOKENS,
    prompt_cache_key: PROMPT_VERSION,
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

  return rawContent;
}

function parseAndValidateModelOutput(rawContent: string): z.infer<typeof modelOutputSchema> {
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
  const age = answers.age.toLowerCase();
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
    age,
    personality,
    ...(personalityKeywords[personality] ?? []),
    ...freeTextTokens,
  ];
}

function scoreCatalogItem(item: CatalogItem, keywords: string[], index: number) {
  const requestedAge = keywords[1];
  const searchableText = [
    item.name,
    item.description,
    item.brand,
    item.category,
    item.subcategory,
    ...item.age_tags,
  ]
    .join(' ')
    .toLowerCase();
  const matchScore = keywords.reduce(
    (score, keyword) => score + (searchableText.includes(keyword) ? 5 : 0),
    0,
  );
  const ageScore =
    requestedAge && item.age_tags.some((ageTag) => ageTag.toLowerCase() === requestedAge) ? 12 : 0;

  return 80 + matchScore + ageScore - index * 0.5;
}

function selectCatalogForRanking(answers: z.infer<typeof answersSchema>, catalog: CatalogItem[]) {
  const keywords = getFallbackKeywords(answers);

  return catalog
    .map((item, index) => ({
      item,
      score: scoreCatalogItem(item, keywords, index),
    }))
    .sort((left, right) => right.score - left.score || left.item.price - right.item.price)
    .slice(0, MODEL_CATALOG_LIMIT)
    .map(({ item }) => item);
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

function repairModelOutputWithCatalog(
  output: z.infer<typeof modelOutputSchema>,
  answers: z.infer<typeof answersSchema>,
  catalog: CatalogItem[],
): z.infer<typeof modelOutputSchema> {
  const ids = new Set(catalog.map((item) => item.id));
  const seenIds = new Set<string>();
  const repairedRecommendations: ModelRecommendation[] = [];

  const rankedRecommendations = output.recommendations
    .slice()
    .sort((left, right) => left.rank - right.rank);

  for (const recommendation of rankedRecommendations) {
    if (!ids.has(recommendation.catalog_item_id) || seenIds.has(recommendation.catalog_item_id)) {
      continue;
    }

    seenIds.add(recommendation.catalog_item_id);
    repairedRecommendations.push({
      ...recommendation,
      rank: repairedRecommendations.length + 1,
    });
  }

  if (repairedRecommendations.length < Math.min(MAX_RECOMMENDATIONS, catalog.length)) {
    const fallbackOutput = buildRateLimitFallbackOutput(answers, catalog);

    for (const recommendation of fallbackOutput.recommendations) {
      if (seenIds.has(recommendation.catalog_item_id)) {
        continue;
      }

      seenIds.add(recommendation.catalog_item_id);
      repairedRecommendations.push({
        ...recommendation,
        rank: repairedRecommendations.length + 1,
      });

      if (repairedRecommendations.length >= MAX_RECOMMENDATIONS) {
        break;
      }
    }
  }

  return {
    summary: output.summary,
    recommendations: repairedRecommendations,
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

  const quizRunPayload = {
    user_id: userId,
    recipient: params.answers.recipient,
    age_bucket: params.answers.age || null,
    personality: params.answers.personality,
    budget: params.budgetRange.persistedBudget,
    free_text: params.answers.freeText,
  };

  let { data: quizRun, error: quizRunError } = await supabase
    .from('quiz_runs')
    .insert(quizRunPayload)
    .select('id')
    .single();

  if (isMissingColumnError(quizRunError, 'age_bucket')) {
    const { age_bucket: _ageBucket, ...legacyQuizRunPayload } = quizRunPayload;
    ({ data: quizRun, error: quizRunError } = await supabase
      .from('quiz_runs')
      .insert(legacyQuizRunPayload)
      .select('id')
      .single());
  }

  if (quizRunError) {
    throw quizRunError;
  }

  if (!quizRun) {
    throw new Error('Could not persist quiz run.');
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

function createStageTimings(): StageTimings {
  return {
    catalog_fetch: 0,
    prompt_build: 0,
    openai_call: 0,
    parse_validate: 0,
    db_persist: 0,
    total: 0,
  };
}

function addElapsed(
  timings: StageTimings,
  stage: Exclude<keyof StageTimings, 'total'>,
  startedAt: number,
) {
  timings[stage] += Date.now() - startedAt;
}

export async function findGifts(
  rawAnswers: GiftAnswers,
  options: FindGiftsOptions = {},
): Promise<GiftResult> {
  const startTime = Date.now();
  const stageTimings = createStageTimings();
  const answers = answersSchema.parse(rawAnswers);
  const budgetRange = parseBudgetRange(answers.budget);
  let model = getOpenAIModel();
  let catalog: CatalogItem[] = [];
  let output: z.infer<typeof modelOutputSchema>;
  let failedRunPersisted = false;

  try {
    const catalogFetchStartedAt = Date.now();
    let fetchedCatalog: CatalogItem[];
    try {
      fetchedCatalog = await fetchBudgetFilteredCatalog(budgetRange);
    } finally {
      addElapsed(stageTimings, 'catalog_fetch', catalogFetchStartedAt);
    }
    catalog = selectCatalogForRanking(answers, fetchedCatalog);

    try {
      if (catalog.length === 0) {
        output = {
          summary:
            'I could not find catalog items inside that budget yet. Try a wider budget and I can look again with more room to match their style.',
          recommendations: [],
        };
      } else {
        const promptBuildStartedAt = Date.now();
        const prompt = buildOpenAIRankingPrompt(answers, catalog);
        addElapsed(stageTimings, 'prompt_build', promptBuildStartedAt);

        const openAIStartedAt = Date.now();
        let rawContent: string;
        try {
          rawContent = await requestModelRanking(prompt, model);
        } finally {
          addElapsed(stageTimings, 'openai_call', openAIStartedAt);
        }

        const parseValidateStartedAt = Date.now();
        try {
          output = parseAndValidateModelOutput(rawContent);
        } finally {
          addElapsed(stageTimings, 'parse_validate', parseValidateStartedAt);
        }
      }
    } catch (error) {
      if (isModelOutputParseError(error)) {
        const dbPersistStartedAt = Date.now();
        try {
          await persistFailedRunBestEffort({
            answers,
            budgetRange,
            model,
            stage: 'model_output_parse',
            error,
            userId: options.userId,
          });
        } finally {
          addElapsed(stageTimings, 'db_persist', dbPersistStartedAt);
        }
        failedRunPersisted = true;
        throw error;
      }

      if (!isRateLimitError(error)) {
        const dbPersistStartedAt = Date.now();
        try {
          await persistFailedRunBestEffort({
            answers,
            budgetRange,
            model,
            stage: 'model_ranking',
            error,
            userId: options.userId,
          });
        } finally {
          addElapsed(stageTimings, 'db_persist', dbPersistStartedAt);
        }
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

    const parseValidateStartedAt = Date.now();
    try {
      validateRankedItems(output, catalog);
    } catch (error) {
      if (catalog.length === 0) {
        throw error;
      }

      console.warn(
        'OpenAI returned recommendations outside the fetched catalog; repairing recommendations with catalog items',
        summarizeError(error),
      );
      output = repairModelOutputWithCatalog(output, answers, catalog);
      validateRankedItems(output, catalog);
    } finally {
      addElapsed(stageTimings, 'parse_validate', parseValidateStartedAt);
    }
  } catch (error) {
    if (failedRunPersisted) {
      stageTimings.total = Date.now() - startTime;
      console.log(JSON.stringify({ stage_timings_ms: stageTimings }));
      throw error;
    }

    if (catalog.length === 0) {
      const dbPersistStartedAt = Date.now();
      try {
        await persistFailedRunBestEffort({
          answers,
          budgetRange,
          model,
          stage: 'catalog_fetch',
          error,
          userId: options.userId,
        });
      } finally {
        addElapsed(stageTimings, 'db_persist', dbPersistStartedAt);
      }
    } else if (!(isModelOutputParseError(error) || isRateLimitError(error))) {
      const dbPersistStartedAt = Date.now();
      try {
        await persistFailedRunBestEffort({
          answers,
          budgetRange,
          model,
          stage: 'recommendation_validation',
          error,
          userId: options.userId,
        });
      } finally {
        addElapsed(stageTimings, 'db_persist', dbPersistStartedAt);
      }
    }

    stageTimings.total = Date.now() - startTime;
    console.log(JSON.stringify({ stage_timings_ms: stageTimings }));
    throw error;
  }

  const dbPersistStartedAt = Date.now();
  let runs: Awaited<ReturnType<typeof persistRuns>>;
  try {
    runs = await persistRuns({
      answers,
      budgetRange,
      model,
      output,
      userId: options.userId,
    });
  } finally {
    addElapsed(stageTimings, 'db_persist', dbPersistStartedAt);
  }

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

  stageTimings.total = Date.now() - startTime;
  console.log(JSON.stringify({ stage_timings_ms: stageTimings }));

  return {
    ...runs,
    promptVersion: PROMPT_VERSION,
    model,
    summary: output.summary,
    recommendations,
    debug_timings: stageTimings,
  };
}
