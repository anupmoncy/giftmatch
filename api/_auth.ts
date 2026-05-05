import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end?: () => void;
};

let supabaseAuthClient: SupabaseClient<any, any, any> | null = null;

function getHeader(req: VercelRequest, name: string): string | undefined {
  const headerName = name.toLowerCase();
  const matchingKey = Object.keys(req.headers).find((key) => key.toLowerCase() === headerName);
  const value = matchingKey ? req.headers[matchingKey] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function getBearerToken(req: VercelRequest): string | undefined {
  const authorization = getHeader(req, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY',
    );
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

export async function getAuthenticatedUserId(req: VercelRequest): Promise<string | null> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await getSupabaseAuthClient().auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user.id;
}
