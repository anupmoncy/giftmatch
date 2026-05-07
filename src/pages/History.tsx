import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../lib/formatters.js';
import { supabase } from '../lib/supabase.js';
import { asArray } from '../lib/supabaseJoins.js';

const pageSize = 10;

type RecommendationRun = {
  id: string;
  model: string | null;
  summary: string | null;
  ranked_output: unknown;
  created_at: string;
};

type QuizRunRow = {
  id: string;
  created_at: string;
  recipient: string | null;
  personality: string | null;
  budget: number | null;
  free_text: string | null;
  recommendation_runs: RecommendationRun[] | RecommendationRun | null;
};

type RankedRecommendation = {
  rank: number;
  score: number | null;
  reason: string;
  gift_angle: string;
  itemName: string | null;
};

function formatBudget(value: number | null) {
  return value === null ? 'Flexible' : `Up to $${value}`;
}

function titleCase(value: string | null) {
  if (!value) {
    return 'Not provided';
  }

  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRankedRecommendations(rankedOutput: unknown): RankedRecommendation[] {
  if (!rankedOutput || typeof rankedOutput !== 'object' || !('recommendations' in rankedOutput)) {
    return [];
  }

  const recommendations = (rankedOutput as { recommendations?: unknown }).recommendations;

  if (!Array.isArray(recommendations)) {
    return [];
  }

  return recommendations
    .map((recommendation): RankedRecommendation | null => {
      if (!recommendation || typeof recommendation !== 'object') {
        return null;
      }

      const raw = recommendation as Record<string, unknown>;
      const item = raw.item && typeof raw.item === 'object' ? (raw.item as Record<string, unknown>) : null;
      const rank = getNumber(raw.rank) ?? 0;

      return {
        rank,
        score: getNumber(raw.score),
        reason: getString(raw.reason) ?? 'No reason recorded.',
        gift_angle: getString(raw.gift_angle) ?? 'Gift idea',
        itemName: getString(item?.name),
      };
    })
    .filter((recommendation): recommendation is RankedRecommendation => Boolean(recommendation))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 5);
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [quizRuns, setQuizRuns] = useState<QuizRunRow[]>([]);
  const [page, setPage] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user) {
          navigate('/login', { replace: true });
          return;
        }

        const { data, error: historyError, count } = await supabase
          .from('quiz_runs')
          .select(
            'id, created_at, recipient, personality, budget, free_text, recommendation_runs(id, model, summary, ranked_output, created_at)',
            { count: 'exact' },
          )
          .order('created_at', { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (historyError) {
          throw historyError;
        }

        if (isMounted) {
          setQuizRuns((data ?? []) as QuizRunRow[]);
          setTotalRuns(count ?? 0);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load your history.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [navigate, page]);

  const totalPages = Math.max(1, Math.ceil(totalRuns / pageSize));

  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 pt-12">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
          My history
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900">Your gift searches</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Review your previous quiz inputs and the recommendation summaries saved to your account.
        </p>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-gray-100 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : quizRuns.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">No searches yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your completed gift searches will appear here after you run the quiz.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {quizRuns.map((quizRun) => {
            const recommendation = asArray(quizRun.recommendation_runs)[0] ?? null;
            const rankedRecommendations = getRankedRecommendations(recommendation?.ranked_output);

            return (
              <article
                key={quizRun.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-400">
                      {formatDateTime(quizRun.created_at)}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900">
                      Gift search for {titleCase(quizRun.recipient)}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-600">
                      {titleCase(quizRun.personality)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
                      {formatBudget(quizRun.budget)}
                    </span>
                  </div>
                </div>

                {quizRun.free_text ? (
                  <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm leading-6 text-gray-600">
                    {quizRun.free_text}
                  </p>
                ) : null}

                {recommendation?.summary ? (
                  <p className="mt-4 text-sm leading-6 text-gray-700">{recommendation.summary}</p>
                ) : (
                  <p className="mt-4 text-sm text-gray-400">No recommendation summary recorded.</p>
                )}

                {rankedRecommendations.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {rankedRecommendations.map((rankedRecommendation) => (
                      <div
                        key={`${quizRun.id}-${rankedRecommendation.rank}`}
                        className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-gray-800">
                            #{rankedRecommendation.rank}{' '}
                            {rankedRecommendation.itemName ?? rankedRecommendation.gift_angle}
                          </p>
                          {rankedRecommendation.score === null ? null : (
                            <span className="text-xs font-semibold text-indigo-500">
                              {Math.round(rankedRecommendation.score)}%
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          {rankedRecommendation.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalRuns)} of{' '}
              {totalRuns}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                disabled={page === 0}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))
                }
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
