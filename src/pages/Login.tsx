import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { normalizeAuthIdentifier } from '../lib/userIdentity.js';

async function createConfirmedUser(username: string, password: string) {
  const response = await fetch('/api/sign-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      typeof errorBody?.error === 'string' ? errorBody.error : 'Could not create user';
    throw new Error(message);
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        await createConfirmedUser(username, password);
        setNotice('Skipping verification for the demo');
      }

      const authResponse = await supabase.auth.signInWithPassword({
        email: normalizeAuthIdentifier(username),
        password,
      });

      if (authResponse.error) {
        setError(authResponse.error.message);
        return;
      }

      window.setTimeout(() => {
        navigate('/quiz', { replace: true });
      }, isSignUp ? 900 : 0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not sign in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto mt-24 max-w-md px-4">
      <div className="mb-8 text-center">
        <Link to="/quiz" className="inline-block text-2xl font-bold text-gray-900">
          <span aria-hidden="true">🎁</span> GiftMatch
        </Link>
        <p className="mt-2 text-sm text-gray-400">Gift recommendations powered by AI</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <h1 className="mt-2 text-3xl font-semibold text-gray-900">
          {isSignUp ? 'Create your account' : 'Login'}
        </h1>
        <p className="mt-3 text-gray-500">
          {isSignUp
            ? 'Sign up to start matching thoughtful gift ideas.'
            : 'Sign in to start matching gifts.'}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-indigo-50 p-1">
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              !isSignUp ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500',
            ].join(' ')}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              isSignUp ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500',
            ].join(' ')}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="text-sm font-semibold text-gray-700">
              Username or email
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              className="mt-2 w-full rounded-xl border-2 border-gray-100 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-semibold text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              className="mt-2 w-full rounded-xl border-2 border-gray-100 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-400"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-5 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-200 hover:-translate-y-0.5 hover:from-indigo-600 hover:to-purple-600 hover:shadow-xl hover:shadow-indigo-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {isSubmitting ? 'Please wait...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>
      </div>
    </section>
  );
}
