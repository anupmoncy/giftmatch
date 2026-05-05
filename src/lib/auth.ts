import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

export type GiftMatchSession = Session;

export async function checkAuth(): Promise<GiftMatchSession | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

export async function checkAdmin(): Promise<boolean> {
  const session = await checkAuth();

  if (!session?.user || !session.access_token) {
    return false;
  }

  const response = await fetch('/api/admin-status', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    return false;
  }

  const body = (await response.json().catch(() => null)) as { isAdmin?: boolean } | null;

  return body?.isAdmin === true;
}
