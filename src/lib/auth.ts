import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

const DEMO_AUTH_KEY = 'giftmatch_demo_auth';

type DemoSession = {
  access_token: string;
  user: {
    id: string;
    email: string;
  };
  isDemo: true;
};

export type GiftMatchSession = Session | DemoSession;

export function enableDemoAuth(email: string) {
  window.localStorage.setItem(
    DEMO_AUTH_KEY,
    JSON.stringify({
      email,
      enabledAt: new Date().toISOString(),
    }),
  );
}

export function isDemoAuthEnabled() {
  return Boolean(window.localStorage.getItem(DEMO_AUTH_KEY));
}

function getDemoSession(): DemoSession | null {
  const rawDemoAuth = window.localStorage.getItem(DEMO_AUTH_KEY);

  if (!rawDemoAuth) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDemoAuth) as { email?: string };

    return {
      access_token: 'demo',
      user: {
        id: 'demo-user',
        email: parsed.email ?? 'demo@giftmatch.local',
      },
      isDemo: true,
    };
  } catch {
    window.localStorage.removeItem(DEMO_AUTH_KEY);
    return null;
  }
}

export async function checkAuth(): Promise<GiftMatchSession | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session ?? getDemoSession();
}

export async function checkAdmin(): Promise<boolean> {
  const session = await checkAuth();

  if (!session?.user || 'isDemo' in session) {
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
