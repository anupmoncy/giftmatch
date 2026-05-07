import { createClient } from '@supabase/supabase-js';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status(statusCode: number): VercelResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

type UserRole = 'user' | 'admin';

type ProfileRow = {
  id: string;
  email: string | null;
  role: UserRole;
};

type AuthUserRow = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type UpdateBody = {
  userId?: unknown;
  role?: unknown;
  access?: unknown;
};

function getEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

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

function getQueryValue(req: VercelRequest, name: string): string | undefined {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
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

async function requireAdmin(req: VercelRequest) {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return { status: 401 as const };
  }

  const {
    data: { user },
    error: authError,
  } = await getSupabaseAuthClient().auth.getUser(accessToken);

  if (authError || !user) {
    return { status: 401 as const };
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (profile?.role !== 'admin') {
    return { status: 403 as const };
  }

  return { status: 200 as const, supabaseAdmin, adminUserId: user.id };
}

function isRole(value: unknown): value is UserRole {
  return value === 'user' || value === 'admin';
}

function isAccess(value: unknown): value is 'active' | 'revoked' {
  return value === 'active' || value === 'revoked';
}

function isRevoked(bannedUntil: string | null | undefined) {
  if (!bannedUntil) {
    return false;
  }

  const bannedUntilDate = new Date(bannedUntil);
  return Number.isFinite(bannedUntilDate.getTime()) && bannedUntilDate.getTime() > Date.now();
}

async function listUsers(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);

  if (admin.status !== 200) {
    res.status(admin.status).json({ error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' });
    return;
  }

  const search = getQueryValue(req, 'search')?.trim() ?? '';
  const {
    data: { users: authUsers },
    error: authUsersError,
  } = await admin.supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (authUsersError) {
    throw authUsersError;
  }

  const filteredAuthUsers = ((authUsers ?? []) as AuthUserRow[])
    .filter((user) => !search || (user.email ?? '').toLowerCase().includes(search.toLowerCase()))
    .slice(0, 50);
  const userIds = filteredAuthUsers.map((user) => user.id);

  const { data: profiles, error: profilesError } =
    userIds.length > 0
      ? await admin.supabaseAdmin.from('profiles').select('id, email, role').in('id', userIds)
      : { data: [] as ProfileRow[], error: null };

  if (profilesError) {
    throw profilesError;
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const users = filteredAuthUsers
    .map((user) => {
      const profile = profilesById.get(user.id);

      return {
        id: user.id,
        email: profile?.email ?? user.email ?? null,
        role: profile?.role ?? 'user',
        access: isRevoked(user.banned_until) ? 'revoked' : 'active',
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      };
    })
    .sort((left, right) => (left.email ?? '').localeCompare(right.email ?? ''));

  res.status(200).json({ users });
}

async function updateUser(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);

  if (admin.status !== 200) {
    res.status(admin.status).json({ error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' });
    return;
  }

  const { userId, role, access } = (req.body ?? {}) as UpdateBody;

  if (typeof userId !== 'string' || !userId) {
    res.status(400).json({ error: 'User id is required' });
    return;
  }

  if (role !== undefined && !isRole(role)) {
    res.status(400).json({ error: 'Role must be user or admin' });
    return;
  }

  if (access !== undefined && !isAccess(access)) {
    res.status(400).json({ error: 'Access must be active or revoked' });
    return;
  }

  if (userId === admin.adminUserId && (role === 'user' || access === 'revoked')) {
    res.status(400).json({ error: 'You cannot remove your own admin access' });
    return;
  }

  if (role) {
    const { error: roleError } = await admin.supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (roleError) {
      throw roleError;
    }
  }

  if (access) {
    const { error: accessError } = await admin.supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: access === 'revoked' ? '876000h' : 'none',
    } as any);

    if (accessError) {
      throw accessError;
    }
  }

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      await listUsers(req, res);
    } catch (error) {
      console.error('admin-users list failed', error);
      res.status(500).json({ error: 'Could not load users' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      await updateUser(req, res);
    } catch (error) {
      console.error('admin-users update failed', error);
      res.status(500).json({ error: 'Could not update user' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, PATCH');
  res.status(405).json({ error: 'Method not allowed' });
}
