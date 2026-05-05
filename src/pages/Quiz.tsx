import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GiftCard } from '../components/GiftCard.js';
import {
  findGifts,
  preloadGiftAuth,
  warmBudgetCatalog,
  type GiftResult,
} from '../lib/apiClient.js';
import { checkAuth } from '../lib/auth.js';
import { quizResetEventName } from '../lib/quizReset.js';

type Phase = 'quiz' | 'loading' | 'results';
type AnswerKey = 'recipient' | 'personality' | 'budget';

type QuizOption = {
  value: string;
  label: string;
  emoji: string;
};

type SelectQuestion = {
  key: AnswerKey;
  heading: string;
  options: QuizOption[];
};

export type QuizAnswers = {
  recipient: string;
  personality: string;
  budget: string;
  freeText: string;
};

const maxFreeTextLength = 300;
const loadingHeadlines = [
  'Finding your perfect match...',
  'Searching thousands of gifts...',
  'Ranking by personality...',
  'Almost there...',
];

const questions: SelectQuestion[] = [
  {
    key: 'budget',
    heading: "What's the budget?",
    options: [
      { value: 'under-25', label: 'Under $25', emoji: '🌱' },
      { value: '25-50', label: '$25-$50', emoji: '🎁' },
      { value: '50-100', label: '$50-$100', emoji: '✨' },
      { value: '100-200', label: '$100-$200', emoji: '💎' },
      { value: 'splurge', label: 'Splurge', emoji: '🚀' },
      { value: 'flexible', label: 'Flexible', emoji: '🔎' },
    ],
  },
  {
    key: 'recipient',
    heading: 'Who is this for?',
    options: [
      { value: 'partner', label: 'Partner', emoji: '💛' },
      { value: 'parent', label: 'Parent', emoji: '🏡' },
      { value: 'friend', label: 'Friend', emoji: '🎉' },
      { value: 'coworker', label: 'Coworker', emoji: '💼' },
      { value: 'sibling', label: 'Sibling', emoji: '🙌' },
      { value: 'kid', label: 'Kid', emoji: '🧸' },
    ],
  },
  {
    key: 'personality',
    heading: "What's their personality?",
    options: [
      { value: 'creative', label: 'Creative', emoji: '🎨' },
      { value: 'practical', label: 'Practical', emoji: '🧰' },
      { value: 'sentimental', label: 'Sentimental', emoji: '📸' },
      { value: 'adventurous', label: 'Adventurous', emoji: '🗺️' },
      { value: 'cozy', label: 'Cozy', emoji: '☕' },
      { value: 'techy', label: 'Techy', emoji: '⚡' },
    ],
  },
];

function buildCompleteAnswers(answers: Partial<QuizAnswers>, freeText: string): QuizAnswers {
  return {
    recipient: answers.recipient ?? '',
    personality: answers.personality ?? '',
    budget: answers.budget ?? '',
    freeText,
  };
}

export function QuizPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('quiz');
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<GiftResult | null>(null);
  const [error, setError] = useState('');
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [loadingHeadlineIndex, setLoadingHeadlineIndex] = useState(0);
  const [loadingHeadlineVisible, setLoadingHeadlineVisible] = useState(true);
  const warmingBudgetsRef = useRef(new Set<string>());
  const canSubmit = Boolean(answers.recipient && answers.personality && answers.budget);
  const answeredQuestionCount =
    Number(Boolean(answers.recipient)) +
    Number(Boolean(answers.personality)) +
    Number(Boolean(answers.budget)) +
    Number(Boolean(freeText.trim()));
  const progressPercent = (answeredQuestionCount / 4) * 100;

  useEffect(() => {
    let isMounted = true;

    checkAuth()
      .then((session) => {
        if (isMounted && !session) {
          navigate('/login', { replace: true });
        } else if (isMounted) {
          preloadGiftAuth();
          warmBudget('flexible');
        }
      })
      .catch(() => {
        if (isMounted) {
          navigate('/login', { replace: true });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  function warmBudget(budget: string) {
    if (!budget || warmingBudgetsRef.current.has(budget)) {
      return;
    }

    warmingBudgetsRef.current.add(budget);
    warmBudgetCatalog({ budget }).catch(() => {
      warmingBudgetsRef.current.delete(budget);
    });
  }

  useEffect(() => {
    if (phase !== 'loading') {
      setLoadingElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setLoadingElapsedSeconds(0);

    const intervalId = window.setInterval(() => {
      setLoadingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'loading') {
      setLoadingHeadlineIndex(0);
      setLoadingHeadlineVisible(true);
      return;
    }

    setLoadingHeadlineIndex(0);
    setLoadingHeadlineVisible(true);

    let transitionTimeoutId: number | undefined;
    const intervalId = window.setInterval(() => {
      setLoadingHeadlineVisible(false);

      transitionTimeoutId = window.setTimeout(() => {
        setLoadingHeadlineIndex((currentIndex) => (currentIndex + 1) % loadingHeadlines.length);
        setLoadingHeadlineVisible(true);
      }, 400);
    }, 2500);

    return () => {
      window.clearInterval(intervalId);

      if (transitionTimeoutId) {
        window.clearTimeout(transitionTimeoutId);
      }
    };
  }, [phase]);

  async function submitQuiz(nextFreeText: string) {
    const completeAnswers = buildCompleteAnswers(answers, nextFreeText);

    if (!completeAnswers.recipient || !completeAnswers.personality || !completeAnswers.budget) {
      setError('Please complete the quiz before finding gifts.');
      setPhase('quiz');
      return;
    }

    setError('');
    setResult(null);
    setPhase('loading');

    try {
      const giftResult = await findGifts(completeAnswers);
      setResult(giftResult);
      setPhase('results');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not find gifts.');
      setPhase('quiz');
    }
  }

  function handleSelect(key: AnswerKey, value: string) {
    if (key === 'budget') {
      warmBudget(value);
    }

    setAnswers((currentAnswers) => ({ ...currentAnswers, [key]: value }));
  }

  function startOver() {
    setPhase('quiz');
    setAnswers({});
    setFreeText('');
    setResult(null);
    setError('');
    warmingBudgetsRef.current.clear();
  }

  useEffect(() => {
    window.addEventListener(quizResetEventName, startOver);
    return () => window.removeEventListener(quizResetEventName, startOver);
  }, []);

  useEffect(() => {
    if (phase !== 'results' || !result) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [phase, result]);

  if (phase === 'loading') {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#FDFCFB] to-[#F0EDFF] px-6 text-center">
        <div
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-3xl shadow-[0_8px_32px_rgba(99,102,241,0.3)]"
          style={{ animation: 'float 2s ease-in-out infinite' }}
        >
          🎁
        </div>

        <h1
          className={[
            'mb-2 text-2xl font-bold text-gray-900 transition-opacity duration-[400ms]',
            loadingHeadlineVisible ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          {loadingHeadlines[loadingHeadlineIndex]}
        </h1>

        <p className="mt-1 text-sm text-gray-400">Ideal wait is around 15 seconds</p>

        <p className="mt-8 text-lg font-semibold tracking-wide text-gray-500" aria-live="polite">
          {loadingElapsedSeconds}s
        </p>

        <p className="mt-6 text-[11px] tracking-wide text-gray-300">
          Powered by OpenAI · Thousands of gifts considered
        </p>
      </section>
    );
  }

  if (phase === 'results' && result) {
    const maybeFallbackResult = result as GiftResult & {
      fallback_mode?: boolean;
      fallbackMode?: boolean;
    };
    const isFallback =
      maybeFallbackResult.fallback_mode ||
      maybeFallbackResult.fallbackMode ||
      result.model.includes('fallback');
    const hasNoExactMatches = Boolean(result.no_exact_matches);

    return (
      <section className="mx-auto max-w-2xl px-4 pb-16 pt-24">
        {hasNoExactMatches ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm shadow-amber-900/5">
            <p className="text-2xl font-extrabold text-gray-900">No items found</p>
            <p className="mt-2 text-sm leading-relaxed text-amber-700">
              Here are some alternatives from the catalog that may still work.
            </p>
          </div>
        ) : null}

        {isFallback ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-600">
            <span aria-hidden="true">⚡</span>
            <span>Showing catalog preview — live AI recommendations coming soon</span>
          </div>
        ) : null}

        <div className="mb-8 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-400">
            <span aria-hidden="true">✨</span>
            YOUR RECOMMENDATION
          </p>
          <p className="text-sm italic leading-relaxed text-gray-700">{result.summary}</p>
        </div>

        {result.recommendations.length > 0 ? (
          <>
            <p className="mb-3 text-sm font-medium text-gray-500">
              {hasNoExactMatches
                ? 'Here are the top 5 alternatives.'
                : 'Here are some close matches we found from the catalog.'}
            </p>
            <div className="grid grid-cols-1 gap-3">
              {result.recommendations
                .slice()
                .sort((left, right) => left.rank - right.rank)
                .slice(0, 5)
                .map((gift) => (
                  <GiftCard
                    key={`${result.recommendationRunId ?? 'run'}-${gift.catalog_item_id}`}
                    gift={gift}
                    recommendationRunId={result.recommendationRunId}
                  />
                ))}
            </div>
          </>
        ) : null}

        {result.recommendations.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-2xl font-extrabold text-gray-900">No items found</p>
            <p className="mt-2 text-sm text-gray-500">
              No catalog alternatives are available yet. Try a wider budget or add more context.
            </p>
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={startOver}
            className="text-sm text-gray-400 underline underline-offset-4 transition hover:text-indigo-600"
          >
            ← Start over
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-3.5rem)] bg-[#FFFDF9]">
      <div className="fixed left-0 right-0 top-14 z-40 h-[3px] bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-[width] duration-[400ms] ease-[ease]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mx-auto max-w-xl px-5 pb-20 pt-20">
        <div className="mb-8 border-b border-gray-200/70 pb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-amber-500">
            Gift Discovery
          </p>
          <h1 className="mb-2 text-4xl font-bold leading-tight text-gray-900">
            Find the perfect gift.
          </h1>
          <p className="text-base text-gray-400">Four questions. Instant AI match.</p>
        </div>

        {error ? (
          <div className="mb-8 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <div>
          {questions.map((question, index) => (
            <div
              key={question.key}
              className="giftmatch-appear-question mb-8 border-b border-gray-200/70 pb-8"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <p
                role="heading"
                aria-level={2}
                className="mb-3 text-sm font-bold text-gray-900"
              >
                {question.heading}
              </p>
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => {
                  const isSelected = answers[question.key] === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onFocus={() => {
                        if (question.key === 'budget') {
                          warmBudget(option.value);
                        }
                      }}
                      onPointerEnter={() => {
                        if (question.key === 'budget') {
                          warmBudget(option.value);
                        }
                      }}
                      onClick={() => handleSelect(question.key, option.value)}
                      className={[
                        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150',
                        isSelected
                          ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900',
                      ].join(' ')}
                    >
                      <span>{option.emoji}</span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div
            className="giftmatch-appear-question mb-8 border-b border-gray-200/70 pb-8"
            style={{ animationDelay: `${questions.length * 100}ms` }}
          >
            <p
              id="free-text-answer-label"
              role="heading"
              aria-level={2}
              className="mb-3 text-sm font-bold text-gray-900"
            >
              Anything else we should know?
            </p>
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm shadow-amber-900/5 transition focus-within:border-gray-400 focus-within:shadow-md">
              <textarea
                id="free-text-answer"
                aria-labelledby="free-text-answer-label"
                value={freeText}
                maxLength={maxFreeTextLength}
                onChange={(event) => setFreeText(event.target.value)}
                className="h-24 w-full resize-none border-0 bg-transparent text-sm leading-6 text-gray-700 outline-none placeholder:text-gray-300 focus:ring-0"
                placeholder="e.g. She loves plants and just got promoted..."
              />
              <p className="text-right text-[11px] font-medium text-gray-300">
                {freeText.length}/{maxFreeTextLength}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submitQuiz(freeText.trim())}
            className={[
              'giftmatch-submit relative h-14 w-full overflow-hidden rounded-full bg-gray-900 text-base font-bold text-white shadow-lg shadow-gray-900/15 transition-all duration-200',
              canSubmit
                ? 'hover:-translate-y-0.5 hover:bg-black hover:shadow-xl hover:shadow-gray-900/20 active:translate-y-0'
                : 'cursor-not-allowed opacity-40',
            ].join(' ')}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              <span>Find Perfect Gifts</span>
              <span className="giftmatch-submit-arrow" aria-hidden="true">
                →
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
