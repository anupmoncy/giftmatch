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

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error) {
    return false;
  }

  return profile?.role === 'admin';
}
