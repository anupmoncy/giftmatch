import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  createClient: vi.fn(),
  createUser: vi.fn(),
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
  };
}

async function callHandler(options: { method?: string; body?: unknown }) {
  const { default: handler } = await import('../../api/sign-up.js');
  const res = createResponse();
  await handler(
    {
      method: options.method ?? 'POST',
      body: options.body ?? { username: 'friend@example.com', password: 'secret1' },
    },
    res,
  );
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  mockState.createUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  mockState.createClient.mockReturnValue({
    auth: {
      admin: {
        createUser: mockState.createUser,
      },
    },
  });
});

describe('POST /api/sign-up', () => {
  it('creates a confirmed user with the provided username as the email', async () => {
    const res = await callHandler({});

    expect(res.statusCode).toBe(201);
    expect(mockState.createUser).toHaveBeenCalledWith({
      email: 'friend@example.com',
      password: 'secret1',
      email_confirm: true,
      user_metadata: { username: 'friend@example.com' },
    });
    expect(res.body).toEqual({ userId: 'user-1' });
  });

  it('returns 400 for a short password', async () => {
    const res = await callHandler({ body: { username: 'friend@example.com', password: '123' } });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Password must be at least 6 characters' });
    expect(mockState.createUser).not.toHaveBeenCalled();
  });
});
