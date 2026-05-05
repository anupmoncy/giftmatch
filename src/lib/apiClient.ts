import { supabase } from './supabase';
import { isDemoAuthEnabled } from './auth';
import type { GiftAnswers, GiftResult } from '../services/findGifts';

export type { GiftAnswers, GiftResult };

export async function findGifts(answers: GiftAnswers): Promise<GiftResult> {
  const isDemo = isDemoAuthEnabled();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.access_token && !isDemo) {
    throw new Error('You must be signed in to find gifts');
  }

  const response = await fetch('/api/find-gifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(isDemo ? { 'X-GiftMatch-Demo': 'true' } : {}),
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
