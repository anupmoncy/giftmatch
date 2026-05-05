import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { enableDemoAuth } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function continueInDemoMode() {
    enableDemoAuth(email);
    navigate('/quiz', { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const authResponse = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);

    if (authResponse.error) {
      if (authResponse.error.message.toLowerCase().includes('email not confirmed')) {
        continueInDemoMode();
        return;
      }

      setError(authResponse.error.message);
      return;
    }

    if (isSignUp && !authResponse.data.session) {
      continueInDemoMode();
      return;
    }

    navigate('/quiz', { replace: true });
  }

  return (
    <section className="mx-auto mt-24 max-w-md px-4">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">GiftMatch</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900">
          {isSignUp ? 'Create your account' : 'Login'}
        </h1>
        <p className="mt-3 text-gray-500">
          {isSignUp
            ? 'Sign up to start matching thoughtful gift ideas. Demo sign-up bypasses email verification so reviewers can get in immediately.'
            : 'Sign in to start matching gifts.'}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              !isSignUp ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
            ].join(' ')}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={[
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              isSignUp ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
            ].join(' ')}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-semibold text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
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
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-lg bg-black px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? 'Please wait...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>
      </div>
    </section>
  );
}
