import { supabase } from './supabase.js';
import type { GiftAnswers, GiftResult, GiftWarmupAnswers } from '../services/findGifts.js';

export type { GiftAnswers, GiftResult, GiftWarmupAnswers };

async function getAccessToken() {
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

export async function findGifts(answers: GiftAnswers): Promise<GiftResult> {
  const accessToken = await getAccessToken();

  const response = await fetch('/api/find-gifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ answers }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      typeof errorBody?.error === 'string' ? errorBody.error : 'Could not find gifts';
    throw new Error(message);
  }

  return (await response.json()) as GiftResult;
}

export async function warmBudgetCatalog(answers: GiftWarmupAnswers): Promise<void> {
  const accessToken = await getAccessToken();

  await fetch('/api/find-gifts-warmup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ answers }),
  });
}
