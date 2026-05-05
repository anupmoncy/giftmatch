import { createClient } from '@supabase/supabase-js';
import { findGifts } from '../src/services/findGifts.js';
import type { GiftAnswers, GiftResult } from '../src/services/findGifts.js';

const MAX_DEMO_RECOMMENDATIONS = 6;

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  brand: string;
  category: string;
  subcategory: string;
};

type BudgetRange = {
  min?: number;
  max?: number;
};

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(req: VercelRequest): string | undefined {
  const authorization = getHeader(req, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function isDemoRequest(req: VercelRequest): boolean {
  const demoHeader = getHeader(req, 'x-giftmatch-demo');
  const demoBypassAllowed =
    process.env.GIFTMATCH_DEMO_BYPASS === 'true' || process.env.NODE_ENV !== 'production';

  return demoBypassAllowed && demoHeader === 'true';
}

function isDemoModeEnabled(): boolean {
  return process.env.VITE_DEMO_MODE === 'true';
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

function parseBudgetRange(budget: string): BudgetRange {
  const normalized = budget.trim().toLowerCase();
  const numbers = Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g), (match) => Number(match[0]));

  if (normalized.includes('flex')) {
    return {};
  }

  if (normalized.includes('under') || normalized.includes('below') || normalized.includes('<')) {
    return { max: numbers[0] ?? 25 };
  }

  if (normalized.includes('splurge')) {
    return { min: 200 };
  }

  if (numbers.length >= 2) {
    return {
      min: Math.min(numbers[0], numbers[1]),
      max: Math.max(numbers[0], numbers[1]),
    };
  }

  if (numbers.length === 1) {
    return { max: numbers[0] };
  }

  return {};
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function fetchDemoCatalogItems(answers: GiftAnswers): Promise<CatalogItem[]> {
  const budgetRange = parseBudgetRange(String(answers.budget ?? ''));
  const selectFields = 'id, name, description, price, image_url, brand, category, subcategory';
  let query = getSupabaseAdminClient()
    .from('catalog')
    .select(selectFields)
    .order('price', { ascending: true })
    .limit(MAX_DEMO_RECOMMENDATIONS);

  if (typeof budgetRange.min === 'number') {
    query = query.gte('price', budgetRange.min);
  }

  if (typeof budgetRange.max === 'number') {
    query = query.lte('price', budgetRange.max);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if ((data ?? []).length >= MAX_DEMO_RECOMMENDATIONS) {
    return data as CatalogItem[];
  }

  const { data: fallbackData, error: fallbackError } = await getSupabaseAdminClient()
    .from('catalog')
    .select(selectFields)
    .order('price', { ascending: true })
    .limit(MAX_DEMO_RECOMMENDATIONS);

  if (fallbackError) {
    throw fallbackError;
  }

  return (fallbackData ?? []) as CatalogItem[];
}

function getDemoReason(item: CatalogItem, answers: GiftAnswers, rank: number): string {
  const recipient = String(answers.recipient || 'recipient').toLowerCase();
  const personality = String(answers.personality || 'thoughtful').toLowerCase();
  const rankLead =
    rank === 1
      ? 'Best match'
      : rank <= 3
        ? 'Strong match'
        : 'Good backup pick';

  return `${rankLead}: ${item.name} fits a ${personality} ${recipient} because it feels useful, personal, and easy to enjoy without needing extra setup.`;
}

function getDemoGiftAngle(item: CatalogItem, answers: GiftAnswers): string {
  const personality = String(answers.personality || '').toLowerCase();

  if (personality.includes('creative')) {
    return `Creative ${item.subcategory}`;
  }

  if (personality.includes('practical')) {
    return `Practical everyday ${item.category}`;
  }

  if (personality.includes('sentimental')) {
    return `Thoughtful ${item.subcategory}`;
  }

  if (personality.includes('adventurous')) {
    return `Ready-for-anything ${item.category}`;
  }

  if (personality.includes('cozy')) {
    return `Cozy comfort ${item.subcategory}`;
  }

  if (personality.includes('techy')) {
    return `Clever ${item.category}`;
  }

  return `Personal ${item.subcategory}`;
}

async function buildRateLimitDemoResult(answers: GiftAnswers): Promise<GiftResult> {
  const catalogItems = await fetchDemoCatalogItems(answers);
  const rankedItems = catalogItems.slice(0, MAX_DEMO_RECOMMENDATIONS);

  return {
    quizRunId: null,
    recommendationRunId: null,
    promptVersion: 'giftmatch-rate-limit-demo-backup-v1',
    model: 'demo-rate-limit-backup',
    summary:
      'Rate limit hit, so GiftMatch switched to the demo backup. These picks are realistic mock rankings pulled from the live catalog while the OpenAI quota recovers.',
    recommendations: rankedItems.map((item, index) => {
      const rank = index + 1;

      return {
        catalog_item_id: item.id,
        rank,
        score: Math.max(72, 98 - index * 4),
        reason: getDemoReason(item, answers, rank),
        gift_angle: getDemoGiftAngle(item, answers),
        confidence: rank <= 2 ? 'high' : rank <= 5 ? 'medium' : 'low',
        item,
      };
    }),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestBody = req.body as { answers?: GiftAnswers };
    const answers = requestBody.answers ?? (req.body as GiftAnswers);

    const user = await (async () => {
      if (isDemoRequest(req)) {
        return null;
      }

      const accessToken = getBearerToken(req);

      if (!accessToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return undefined;
      }

      const {
        data: { user: authUser },
        error,
      } = await getSupabaseAuthClient().auth.getUser(accessToken);

      if (error || !authUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return undefined;
      }

      return authUser;
    })();

    if (user === undefined) {
      return;
    }

    try {
      const result = await findGifts(answers, user ? { userId: user.id } : {});

      res.status(200).json(result);
    } catch (findGiftsError) {
      if (isDemoModeEnabled() && isRateLimitError(findGiftsError)) {
        console.warn('find-gifts rate limit hit; returning demo backup results', findGiftsError);
        const result = await buildRateLimitDemoResult(answers);

        res.status(200).json(result);
        return;
      }

      throw findGiftsError;
    }
  } catch (error) {
    console.error('find-gifts failed', error);
    res.status(500).json({ error: 'Could not find gifts' });
  }
}
