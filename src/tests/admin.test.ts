import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  createClient: vi.fn(),
  authGetUser: vi.fn(),
  adminGetUserById: vi.fn(),
  adminUpdateUserById: vi.fn(),
  role: 'user',
  quizRuns: [] as Array<Record<string, unknown>>,
  recommendationRuns: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockState.createClient,
}));

type TestResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(statusCode: number): TestResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(): void;
};

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    json(body: unknown) {
      this.body = body;
    },
    end() {},
  };
}

function makeThenable(data: unknown, count?: number) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
      return Promise.resolve({ data, error: null, count }).then(resolve, reject);
    },
  };
}

function makeAdminClient() {
  return {
    auth: {
      admin: {
        getUserById: mockState.adminGetUserById,
        updateUserById: mockState.adminUpdateUserById,
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        const singleQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: mockState.role }, error: null }),
          then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
            return Promise.resolve({ data: mockState.profiles, error: null }).then(resolve, reject);
          },
        };
        return singleQuery;
      }

      if (table === 'quiz_runs') {
        return makeThenable(mockState.quizRuns, mockState.quizRuns.length);
      }

      if (table === 'recommendation_runs') {
        return makeThenable(mockState.recommendationRuns);
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

async function callHandler(headers: Record<string, string> = {}) {
  const { default: handler } = await import('../../api/admin-runs.js');
  const res = createResponse();
  await handler({ method: 'GET', headers }, res);
  return res;
}

async function callUsersHandler({
  method = 'GET',
  headers = {},
  body,
  query,
}: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
} = {}) {
  const { default: handler } = await import('../../api/admin-users.js');
  const res = createResponse();
  await handler({ method, headers, body, query }, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  mockState.role = 'user';
  mockState.quizRuns = [
    {
      id: 'quiz-run-1',
      created_at: '2026-05-05T00:00:00.000Z',
      user_id: 'user-1',
      recipient: 'friend',
      personality: 'creative',
      budget: 50,
      free_text: 'Likes hiking.',
    },
  ];
  mockState.recommendationRuns = [
    {
      id: 'recommendation-run-1',
      quiz_run_id: 'quiz-run-1',
      model: 'gpt-4o-mini',
      summary: 'A warm summary.',
      ranked_output: { recommendations: [] },
    },
  ];
  mockState.authGetUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  mockState.adminGetUserById.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'friend@example.com' } },
    error: null,
  });
  mockState.adminUpdateUserById.mockResolvedValue({
    data: { user: { id: 'user-2' } },
    error: null,
  });
  mockState.profiles = [
    {
      id: 'user-1',
      email: 'friend@example.com',
      role: 'user',
    },
  ];
  mockState.createClient.mockImplementation((_url: string, key: string) => {
    if (key === 'anon-key') {
      return {
        auth: {
          getUser: mockState.authGetUser,
        },
      };
    }

    return makeAdminClient();
  });
});

describe('GET /api/admin-runs', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await callHandler();

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not admin', async () => {
    mockState.role = 'user';

    const res = await callHandler({ Authorization: 'Bearer user-token' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('returns 200 with an array of runs when user is admin', async () => {
    mockState.role = 'admin';

    const res = await callHandler({ Authorization: 'Bearer admin-token' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        runs: expect.any(Array),
      }),
    );
    expect((res.body as { runs: unknown[] }).runs).toHaveLength(1);
    expect(res.body).toEqual(
      expect.objectContaining({
        limit: 10,
        offset: 0,
        total: 1,
      }),
    );
  });

  it('includes email, quiz fields, model, and summary for each run', async () => {
    mockState.role = 'admin';

    const res = await callHandler({ Authorization: 'Bearer admin-token' });
    const [run] = (res.body as { runs: Array<Record<string, unknown>> }).runs;

    expect(run).toEqual(
      expect.objectContaining({
        email: 'friend@example.com',
        recipient: 'friend',
        personality: 'creative',
        budget: 50,
        free_text: 'Likes hiking.',
        model: 'gpt-4o-mini',
        summary: 'A warm summary.',
      }),
    );
  });
});

describe('GET /api/admin-users', () => {
  it('returns 403 when user is not admin', async () => {
    mockState.role = 'user';

    const res = await callUsersHandler({ headers: { Authorization: 'Bearer user-token' } });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('lists users with role and access state for admins', async () => {
    mockState.role = 'admin';
    mockState.adminGetUserById.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'friend@example.com',
          banned_until: null,
          created_at: '2026-05-05T00:00:00.000Z',
          last_sign_in_at: '2026-05-06T00:00:00.000Z',
        },
      },
      error: null,
    });

    const res = await callUsersHandler({ headers: { Authorization: 'Bearer admin-token' } });

    expect(res.statusCode).toBe(200);
    expect((res.body as { users: Array<Record<string, unknown>> }).users).toEqual([
      expect.objectContaining({
        id: 'user-1',
        email: 'friend@example.com',
        role: 'user',
        access: 'active',
      }),
    ]);
  });
});

describe('PATCH /api/admin-users', () => {
  it('updates a user role and revoked access', async () => {
    mockState.role = 'admin';

    const res = await callUsersHandler({
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-token' },
      body: { userId: 'user-2', role: 'admin', access: 'revoked' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockState.adminUpdateUserById).toHaveBeenCalledWith('user-2', {
      ban_duration: '876000h',
    });
  });
});
