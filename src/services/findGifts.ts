import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PROMPT_VERSION = 'giftmatch-rank-v1';
const OPENAI_MODEL = 'gpt-4o-mini';
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
    model: OPENAI_MODEL,
    input: prompt,
  });

  const rawContent = response.output_text;

  if (!rawContent) {
    throw new Error('OpenAI returned an empty recommendation response');
  }

  return modelOutputSchema.parse(JSON.parse(rawContent));
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

async function persistRuns(params: {
  answers: z.infer<typeof answersSchema>;
  budgetRange: BudgetRange;
  model: string;
  output: z.infer<typeof modelOutputSchema>;
  userId?: string;
}) {
  const userId = params.userId ?? getEnv('GIFTMATCH_MCP_USER_ID');

  if (!userId) {
    return { quizRunId: null, recommendationRunId: null };
  }

  const supabase = getSupabaseAdmin();
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
      ranked_output: params.output,
      summary: params.output.summary,
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

export async function findGifts(
  rawAnswers: GiftAnswers,
  options: FindGiftsOptions = {},
): Promise<GiftResult> {
  const answers = answersSchema.parse(rawAnswers);
  const budgetRange = parseBudgetRange(answers.budget);
  const model = OPENAI_MODEL;
  const catalog = await fetchBudgetFilteredCatalog(budgetRange);
  const output = await rankCatalogWithModel(answers, catalog);

  validateRankedItems(output, catalog);

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
