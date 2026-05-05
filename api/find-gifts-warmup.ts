import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { warmGiftSearch } from '../src/services/findGifts.js';
import type { GiftWarmupAnswers } from '../src/services/findGifts.js';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

let supabaseAuthClient: SupabaseClient<any, any, any> | null = null;

function getHeader(req: VercelRequest, name: string): string | undefined {
  const headerName = name.toLowerCase();
  const matchingKey = Object.keys(req.headers).find((key) => key.toLowerCase() === headerName);
  const value = matchingKey ? req.headers[matchingKey] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(req: VercelRequest): string | undefined {
  const authorization = getHeader(req, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function isValidAnswers(value: unknown): value is GiftWarmupAnswers {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GiftWarmupAnswers>;

  return typeof candidate.budget === 'string' && candidate.budget.trim().length > 0;
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY');
  }

  if (process.env.NODE_ENV !== 'test' && supabaseAuthClient) {
    return supabaseAuthClient;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  if (process.env.NODE_ENV !== 'test') {
    supabaseAuthClient = client;
  }

  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestBody = req.body as { answers?: GiftWarmupAnswers };
    const answers = requestBody.answers ?? (req.body as GiftWarmupAnswers);

    if (!isValidAnswers(answers)) {
      res.status(400).json({ error: 'Missing or malformed gift answers' });
      return;
    }

    const accessToken = getBearerToken(req);

    if (!accessToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      data: { user },
      error,
    } = await getSupabaseAuthClient().auth.getUser(accessToken);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await warmGiftSearch({ budget: answers.budget });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.warn('find-gifts warmup failed', error);
    res.status(200).json({ ok: false });
  }
}
