import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: mockState.getSession,
      refreshSession: mockState.refreshSession,
      onAuthStateChange: mockState.onAuthStateChange,
    },
  },
}));

const answers = {
  recipient: 'friend',
  personality: 'creative',
  budget: '25-50',
  freeText: 'Likes art.',
};

const giftResult = {
  quizRunId: 'quiz-run-1',
  recommendationRunId: 'recommendation-run-1',
  promptVersion: 'giftmatch-rank-v1',
  model: 'gpt-4o-mini',
  summary: 'A warm summary.',
  recommendations: [],
  debug_timings: { total: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockState.getSession.mockResolvedValue({
    data: { session: { access_token: 'stale-token' } },
    error: null,
  });
  mockState.refreshSession.mockResolvedValue({
    data: { session: { access_token: 'fresh-token' } },
    error: null,
  });
  mockState.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  global.fetch = vi.fn();
});

describe('apiClient', () => {
  it('refreshes and retries findGifts once when the cached token is unauthorized', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(giftResult),
      } as unknown as Response);

    const { findGifts } = await import('../lib/apiClient.js');

    await expect(findGifts(answers)).resolves.toEqual(giftResult);
    expect(mockState.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/find-gifts',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer stale-token' }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/find-gifts',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    );
  });

  it('shows a friendly session error when the retry is still unauthorized', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      } as unknown as Response);

    const { findGifts } = await import('../lib/apiClient.js');

    await expect(findGifts(answers)).rejects.toThrow('Your session expired. Please sign in again.');
  });
});
