import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const authResponse = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);

    if (authResponse.error) {
      setError(authResponse.error.message);
      return;
    }

    if (isSignUp && !authResponse.data.session) {
      setError('Please confirm your email before signing in.');
      return;
    }

    navigate('/quiz', { replace: true });
  }

  return (
    <section className="mx-auto mt-24 max-w-md px-4">
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-gray-900">
          <span aria-hidden="true">🎁</span> GiftMatch
        </p>
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
