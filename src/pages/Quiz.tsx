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
const loadingHighlights = ['Budget aware', 'Catalog only', 'Free-text refined'];

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

  if (phase === 'loading') {
    return (
      <section className="min-h-[calc(100vh-3.5rem)] overflow-hidden bg-[#F8FAFC] px-4 pt-28 text-center">
        <div className="giftmatch-loading-card relative mx-auto mb-7 w-full max-w-sm overflow-hidden rounded-2xl border border-white bg-white/90 p-5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="giftmatch-loading-sheen" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="giftmatch-loading-kicker text-xs font-semibold uppercase tracking-widest text-indigo-400">
                Match note
              </p>
              <p className="mt-2 text-xl font-bold leading-tight text-gray-900">
                Looking for gifts that match the person, not just the keywords.
              </p>
            </div>
            <span className="giftmatch-loading-gift flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-xl shadow-[inset_0_0_0_1px_rgba(99,102,241,0.08)]">
              🎁
            </span>
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {loadingHighlights.map((highlight, index) => (
              <span
                key={highlight}
                className="giftmatch-loading-chip rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500"
                style={{ animationDelay: `${120 + index * 90}ms` }}
              >
                {highlight}
              </span>
            ))}
          </div>
        </div>
        <h1 className="giftmatch-loading-title text-2xl font-bold text-gray-900">
          Building your shortlist<span className="giftmatch-loading-dots" aria-hidden="true" />
        </h1>
        <p className="giftmatch-loading-copy mt-2 text-sm text-gray-400">
          Comparing your answers with the catalog and returning only the best fits.
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

    return (
      <section className="mx-auto max-w-2xl px-4 pb-16 pt-24">
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

        {result.recommendations.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            No catalog matches yet. Try a wider budget or add more context.
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
