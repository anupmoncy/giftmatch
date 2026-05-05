import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: mockState.getSession,
    },
    from: mockState.from,
  },
}));

const session = {
  access_token: 'access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'refresh-token',
  user: {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-05-05T00:00:00.000Z',
  },
};

function mockProfileRole(role: 'admin' | 'user') {
  mockState.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { role }, error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.getSession.mockResolvedValue({
    data: { session },
    error: null,
  });
  mockProfileRole('user');
});

describe('auth helpers', () => {
  it('checkAuth returns session when a valid session exists', async () => {
    const { checkAuth } = await import('../lib/auth.js');

    await expect(checkAuth()).resolves.toEqual(session);
  });

  it('checkAuth returns null when no session exists', async () => {
    mockState.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const { checkAuth } = await import('../lib/auth.js');

    await expect(checkAuth()).resolves.toBeNull();
  });

  it('checkAdmin returns true when profiles.role is admin', async () => {
    mockProfileRole('admin');
    const { checkAdmin } = await import('../lib/auth.js');

    await expect(checkAdmin()).resolves.toBe(true);
  });

  it('checkAdmin returns false when profiles.role is user', async () => {
    mockProfileRole('user');
    const { checkAdmin } = await import('../lib/auth.js');

    await expect(checkAdmin()).resolves.toBe(false);
  });

  it('checkAdmin returns false when no session exists', async () => {
    mockState.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const { checkAdmin } = await import('../lib/auth.js');

    await expect(checkAdmin()).resolves.toBe(false);
    expect(mockState.from).not.toHaveBeenCalled();
  });
});
