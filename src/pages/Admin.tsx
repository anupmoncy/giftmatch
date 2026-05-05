import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

type ProfileJoin = {
  email: string | null;
};

type RecommendationRun = {
  id: string;
  model: string | null;
  summary: string | null;
  ranked_output: unknown;
};

type QuizRunRow = {
  id: string;
  created_at: string;
  recipient: string | null;
  personality: string | null;
  budget: number | null;
  free_text: string | null;
  profiles: ProfileJoin | ProfileJoin[] | null;
  recommendation_runs: RecommendationRun[] | RecommendationRun | null;
};

type AdminRunsResponse = {
  quizRuns?: QuizRunRow[];
  error?: string;
};

function asArray<T>(value: T | T[] | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return '—';
  }

  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminPage() {
  const navigate = useNavigate();
  const [quizRuns, setQuizRuns] = useState<QuizRunRow[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.access_token) {
          navigate('/login', { replace: true });
          return;
        }

        const response = await fetch('/api/admin-runs', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const body = (await response.json().catch(() => ({}))) as AdminRunsResponse;

        if (response.status === 403) {
          navigate('/quiz', { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error(body.error ?? 'Could not load admin data.');
        }

        if (isMounted) {
          setQuizRuns(body.quizRuns ?? []);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load admin data.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <section className="min-h-[calc(100vh-7rem)] bg-white p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Recommendation runs</h1>
        <p className="mt-2 text-gray-500">Review quiz inputs, model metadata, and ranked output.</p>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Recipient</th>
                <th className="px-4 py-3 font-semibold">Personality</th>
                <th className="px-4 py-3 font-semibold">Budget</th>
                <th className="px-4 py-3 font-semibold">Free text</th>
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody>
              {quizRuns.map((quizRun, index) => {
                const profile = asOne(quizRun.profiles);
                const recommendation = asArray(quizRun.recommendation_runs)[0] ?? null;
                const isExpanded = expandedRowId === quizRun.id;

                return (
                  <Fragment key={quizRun.id}>
                    <tr
                      onClick={() => setExpandedRowId(isExpanded ? null : quizRun.id)}
                      className={[
                        'cursor-pointer border-b border-gray-100 transition hover:bg-gray-50',
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                      ].join(' ')}
                    >
                      <td className="px-4 py-4 text-gray-600">{formatDate(quizRun.created_at)}</td>
                      <td className="px-4 py-4 text-gray-700">{profile?.email ?? '—'}</td>
                      <td className="px-4 py-4 capitalize text-gray-700">
                        {quizRun.recipient ?? '—'}
                      </td>
                      <td className="px-4 py-4 capitalize text-gray-700">
                        {quizRun.personality ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {quizRun.budget === null ? 'Flexible' : `$${quizRun.budget}`}
                      </td>
                      <td className="max-w-64 px-4 py-4 text-gray-600">
                        {truncate(quizRun.free_text, 60)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{recommendation?.model ?? '—'}</td>
                      <td className="max-w-80 px-4 py-4 text-gray-600">
                        {truncate(recommendation?.summary, 80)}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-gray-100 bg-white">
                        <td colSpan={8} className="px-4 py-4">
                          <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs leading-5 text-gray-700">
                            {JSON.stringify(recommendation?.ranked_output ?? null, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {quizRuns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No quiz runs found yet.</div>
          ) : null}
        </div>
      )}
    </section>
  );
}
