import { supabase } from './supabase.js';
import type { GiftAnswers, GiftResult } from '../services/findGifts.js';

export type { GiftAnswers, GiftResult };

export async function findGifts(answers: GiftAnswers): Promise<GiftResult> {
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

  const response = await fetch('/api/find-gifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
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
