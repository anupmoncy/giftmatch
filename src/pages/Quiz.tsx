import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GiftCard } from '../components/GiftCard.js';
import { findGifts, type GiftResult } from '../lib/apiClient.js';
import { checkAuth } from '../lib/auth.js';

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
const loadingMessages = [
  'Scanning 30+ curated gifts...',
  'Matching to personality type...',
  'Ranking by relevance...',
  'Almost there...',
];

const questions: SelectQuestion[] = [
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
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
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

  useEffect(() => {
    if (phase !== 'loading') {
      setLoadingMessageIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((currentIndex) => (currentIndex + 1) % loadingMessages.length);
    }, 1500);

    return () => window.clearInterval(intervalId);
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
    setAnswers((currentAnswers) => ({ ...currentAnswers, [key]: value }));
  }

  function startOver() {
    setPhase('quiz');
    setAnswers({});
    setFreeText('');
    setResult(null);
    setError('');
  }

  if (phase === 'loading') {
    return (
      <section className="min-h-[calc(100vh-3.5rem)] bg-[linear-gradient(135deg,#F8F7FF_0%,#F0F9FF_100%)] px-4 pt-32 text-center">
        <div className="relative mx-auto mb-8 h-24 w-24">
          <div className="absolute inset-[-8px] rounded-full border-2 border-indigo-200 opacity-75 animate-ping" />
          <div className="absolute inset-[-16px] rounded-full border border-indigo-100 opacity-40 animate-ping [animation-delay:300ms]" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-3xl">
            🎁
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Finding your perfect matches...
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Analysing your preferences against our catalog
        </p>
        <p className="mt-3 text-xs font-medium text-indigo-400 transition-opacity duration-500">
          {loadingMessages[loadingMessageIndex]}
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
    <section className="min-h-[calc(100vh-3.5rem)] bg-[linear-gradient(135deg,#F8F7FF_0%,#F0F9FF_100%)] px-4 pb-16">
      <div className="fixed left-0 right-0 top-14 z-40 h-[3px] bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 transition-[width] duration-[400ms] ease-[ease]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mx-auto max-w-2xl pt-28">
        <div className="pb-4 text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-500 shadow-sm">
            <span aria-hidden="true">✨</span>
            <span>Powered by AI</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Find the perfect gift</h1>
          <p className="mb-12 mt-2 text-base text-gray-400">
            Answer 4 quick questions and we'll match you instantly
          </p>
        </div>

        {error ? (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div>
          {questions.map((question, index) => (
            <div
              key={question.key}
              className="giftmatch-appear-question mb-6"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                Question {index + 1}
              </p>
              <h2 className="mb-4 text-base font-semibold text-gray-800">{question.heading}</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {question.options.map((option) => {
                  const isSelected = answers[question.key] === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(question.key, option.value)}
                      className={[
                        'group relative flex min-h-[72px] cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-xl border border-gray-100 bg-white p-3 transition-all',
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 ring-offset-1'
                          : 'hover:border-indigo-300 hover:bg-indigo-50/50',
                      ].join(' ')}
                    >
                      {isSelected ? (
                        <span
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] text-white shadow-sm"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      ) : null}
                      <span className="text-xl leading-none" aria-hidden="true">
                        {option.emoji}
                      </span>
                      <span className="text-center text-[11px] font-medium text-gray-500 group-hover:text-indigo-600">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div
            className="giftmatch-appear-question"
            style={{ animationDelay: `${questions.length * 100}ms` }}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
              Question 4
            </p>
            <label
              htmlFor="free-text-answer"
              className="mb-4 block text-base font-semibold text-gray-800"
            >
              Anything else we should know?
            </label>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <textarea
                id="free-text-answer"
                value={freeText}
                maxLength={maxFreeTextLength}
                onChange={(event) => setFreeText(event.target.value)}
                className="h-20 w-full resize-none border-0 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-300 focus:ring-0"
                placeholder="e.g. She loves plants and just got promoted..."
              />
              <p className="text-right text-[11px] text-gray-300">
                {freeText.length}/{maxFreeTextLength}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => submitQuiz(freeText.trim())}
            className={[
              'giftmatch-submit relative mt-8 h-14 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-200',
              canSubmit
                ? 'hover:-translate-y-0.5 hover:from-indigo-600 hover:to-purple-600 hover:shadow-xl hover:shadow-indigo-300 active:translate-y-0'
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
