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

type ProfileRow = {
  email: string | null;
};

type RecommendationRunRow = {
  id: string;
  quiz_run_id: string;
  model: string | null;
  summary: string | null;
  ranked_output: unknown;
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
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await getSupabaseAuthClient().auth.getUser(accessToken);

    if (authError || !user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { data: quizRuns, error: quizError } = await supabaseAdmin
      .from('quiz_runs')
      .select('id, created_at, user_id, recipient, personality, budget, free_text')
      .order('created_at', { ascending: false });

    if (quizError) {
      throw quizError;
    }

    const userIds = Array.from(
      new Set((quizRuns ?? []).map((quizRun) => quizRun.user_id).filter(Boolean)),
    );
    const quizRunIds = (quizRuns ?? []).map((quizRun) => quizRun.id);

    const authUsers = await Promise.all(
      userIds.map(async (userId) => {
        const {
          data: { user: authUser },
          error: authUserError,
        } = await supabaseAdmin.auth.admin.getUserById(userId);

        if (authUserError || !authUser) {
          return [userId, { email: null }] as const;
        }

        return [userId, { email: authUser.email ?? null }] as const;
      }),
    );

    const { data: recommendationRuns, error: recommendationRunsError } =
      quizRunIds.length > 0
        ? await supabaseAdmin
            .from('recommendation_runs')
            .select('id, quiz_run_id, model, summary, ranked_output')
            .in('quiz_run_id', quizRunIds)
        : { data: [] as RecommendationRunRow[], error: null };

    if (recommendationRunsError) {
      throw recommendationRunsError;
    }

    const profilesByUserId = new Map<string, ProfileRow>(authUsers);
    const recommendationsByQuizRunId = new Map<string, RecommendationRunRow[]>();

    for (const recommendationRun of (recommendationRuns ?? []) as RecommendationRunRow[]) {
      const currentRuns = recommendationsByQuizRunId.get(recommendationRun.quiz_run_id) ?? [];
      currentRuns.push(recommendationRun);
      recommendationsByQuizRunId.set(recommendationRun.quiz_run_id, currentRuns);
    }

    res.status(200).json({
      quizRuns: (quizRuns ?? []).map((quizRun) => ({
        ...quizRun,
        profiles: profilesByUserId.get(quizRun.user_id) ?? null,
        recommendation_runs: recommendationsByQuizRunId.get(quizRun.id) ?? [],
      })),
    });
  } catch (error) {
    console.error('admin-runs failed', error);
    res.status(500).json({ error: 'Could not load admin data' });
  }
}
