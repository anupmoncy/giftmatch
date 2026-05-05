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
  const canSubmit = Boolean(answers.recipient && answers.personality && answers.budget);

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
      <section className="px-4 pt-32 text-center">
        <div className="relative mx-auto mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 animate-pulse">
          <span
            className="absolute inset-0 flex items-center justify-center text-3xl"
            aria-hidden="true"
          >
            🎁
          </span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">
          Finding your perfect matches...
        </h1>
        <p className="mt-2 animate-pulse text-sm text-gray-400">
          Analysing your preferences against our catalog
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
            .slice(0, 6)
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
    <section className="mx-auto max-w-2xl px-4 pb-16 pt-24">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Find the perfect gift</h1>
        <p className="mt-2 text-base text-gray-400">
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
          <div key={question.key} className="mb-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-500">
              Question {index + 1}
            </p>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{question.heading}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {question.options.map((option) => {
                const isSelected = answers[question.key] === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(question.key, option.value)}
                    className={[
                      'relative flex select-none flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-4 transition-all duration-150',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
                        : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30',
                    ].join(' ')}
                  >
                    {isSelected ? (
                      <span
                        className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] text-white"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span
                      className={[
                        'mt-0.5 text-center text-xs font-medium',
                        isSelected ? 'font-semibold text-indigo-700' : 'text-gray-600',
                      ].join(' ')}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-500">
            Question 4
          </p>
          <label
            htmlFor="free-text-answer"
            className="mb-4 block text-lg font-semibold text-gray-900"
          >
            Anything else we should know?
          </label>
          <textarea
            id="free-text-answer"
            value={freeText}
            maxLength={maxFreeTextLength}
            onChange={(event) => setFreeText(event.target.value)}
            className="h-24 w-full resize-none rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition placeholder:text-gray-300 focus:border-indigo-400"
            placeholder="e.g. She loves plants and just got promoted..."
          />
          <p className="mt-1 text-right text-xs text-gray-300">
            {freeText.length}/{maxFreeTextLength}
          </p>
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => submitQuiz(freeText.trim())}
          className={[
            'mt-8 h-14 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-200',
            canSubmit
              ? 'hover:-translate-y-0.5 hover:from-indigo-600 hover:to-purple-600 hover:shadow-xl hover:shadow-indigo-300 active:translate-y-0'
              : 'cursor-not-allowed opacity-40',
          ].join(' ')}
        >
          Find Perfect Gifts →
        </button>
      </div>
    </section>
  );
}
