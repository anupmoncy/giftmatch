import { createClient } from '@supabase/supabase-js';
import { findGifts } from '../src/services/findGifts';
import type { GiftAnswers } from '../src/services/findGifts';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestBody = req.body as { answers?: GiftAnswers };
    const answers = requestBody.answers ?? (req.body as GiftAnswers);

    if (isDemoRequest(req)) {
      const result = await findGifts(answers);

      res.status(200).json(result);
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

    const result = await findGifts(answers, {
      userId: user.id,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('find-gifts failed', error);
    res.status(500).json({ error: 'Could not find gifts' });
  }
}
