import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function checkAuth(): Promise<Session | null> {
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

  if (!session?.user) {
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error) {
    throw error;
  }

  return data?.role === 'admin';
}
