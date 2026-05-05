import { createClient } from '@supabase/supabase-js';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

function getEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(req: VercelRequest): string | undefined {
  const authorization = getHeader(req, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function getSupabaseUrl() {
  const supabaseUrl = getEnv('SUPABASE_URL') ?? getEnv('VITE_SUPABASE_URL');

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL');
  }

  return supabaseUrl;
}

function getSupabaseAuthClient() {
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY') ?? getEnv('VITE_SUPABASE_ANON_KEY');

  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY');
  }

  return createClient(getSupabaseUrl(), supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      res.status(200).json({ isAdmin: false });
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await getSupabaseAuthClient().auth.getUser(accessToken);

    if (authError || !user) {
      res.status(200).json({ isAdmin: false });
      return;
    }

    const { data: profile, error: profileError } = await getSupabaseAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    res.status(200).json({ isAdmin: profile?.role === 'admin' });
  } catch (error) {
    console.error('admin-status failed', error);
    res.status(500).json({ error: 'Could not check admin status' });
  }
}
