import { supabase } from './supabase.js';
import type { GiftAnswers, GiftResult, GiftWarmupAnswers } from '../services/findGifts.js';

export type { GiftAnswers, GiftResult, GiftWarmupAnswers };

let accessTokenPromise: Promise<string> | null = null;

function clearGiftAuthCache() {
  accessTokenPromise = null;
}

void supabase.auth.onAuthStateChange?.(() => {
  clearGiftAuthCache();
});

async function getAccessToken(options: { forceRefresh?: boolean } = {}) {
  if (options.forceRefresh) {
    clearGiftAuthCache();
  }

  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  accessTokenPromise = getFreshAccessToken(options).catch((error) => {
    accessTokenPromise = null;
    throw error;
  });

  return accessTokenPromise;
}

async function getFreshAccessToken(options: { forceRefresh?: boolean } = {}) {
  if (options.forceRefresh) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

    if (!refreshError && refreshedData.session?.access_token) {
      return refreshedData.session.access_token;
    }
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.access_token) {
    throw new Error('You must be signed in to find gifts');
  }

  return session.access_token;
}

export function preloadGiftAuth() {
  void getAccessToken().catch(() => undefined);
}

async function authorizedFetch(path: string, body: unknown) {
  const makeRequest = async (accessToken: string) =>
    fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

  const accessToken = await getAccessToken();
  const response = await makeRequest(accessToken);

  if (response.status !== 401) {
    return response;
  }

  clearGiftAuthCache();
  const refreshedAccessToken = await getAccessToken({ forceRefresh: true });
  return makeRequest(refreshedAccessToken);
}

export async function findGifts(answers: GiftAnswers): Promise<GiftResult> {
  const response = await authorizedFetch('/api/find-gifts', { answers });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      response.status === 401
        ? 'Your session expired. Please sign in again.'
        : typeof errorBody?.error === 'string'
          ? errorBody.error
          : 'Could not find gifts';
    throw new Error(message);
  }

  return (await response.json()) as GiftResult;
}

export async function warmBudgetCatalog(answers: GiftWarmupAnswers): Promise<void> {
  await authorizedFetch('/api/find-gifts-warmup', { answers });
}
