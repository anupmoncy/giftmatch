import { createClient } from '@supabase/supabase-js';
import { normalizeAuthIdentifier } from '../src/lib/userIdentity.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

type SignUpBody = {
  username?: unknown;
  password?: unknown;
};

function getEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

function getSupabaseUrl() {
  const supabaseUrl = getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL');
  }

  return supabaseUrl;
}

function getSupabaseAdminClient() {
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
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
    const { username, password } = (req.body ?? {}) as SignUpBody;

    if (typeof username !== 'string' || username.trim().length === 0) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const normalizedUsername = username.trim();

    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const {
      data: { user },
      error,
    } = await getSupabaseAdminClient().auth.admin.createUser({
      email: normalizeAuthIdentifier(normalizedUsername),
      password,
      email_confirm: true,
      user_metadata: { username: normalizedUsername },
    });

    if (error || !user) {
      res.status(400).json({ error: error?.message ?? 'Could not create user' });
      return;
    }

    res.status(201).json({ userId: user.id });
  } catch (error) {
    console.error('sign-up failed', error);
    res.status(500).json({ error: 'Could not create user' });
  }
}
