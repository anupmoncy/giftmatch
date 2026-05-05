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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<GiftResult | null>(null);
  const [error, setError] = useState('');

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
    setCurrentQuestionIndex((currentIndex) =>
      currentIndex < questions.length ? currentIndex + 1 : currentIndex,
    );
  }

  function startOver() {
    setPhase('quiz');
    setCurrentQuestionIndex(0);
    setAnswers({});
    setFreeText('');
    setResult(null);
    setError('');
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-12">
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Answer 4 quick questions
        </p>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-10">
          {questions.map((question, index) =>
            index === currentQuestionIndex ? (
              <div key={question.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Question {index + 1} of 4
                </p>
                <h1 className="mb-6 mt-2 text-xl font-semibold text-gray-900">
                  {question.heading}
                </h1>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {question.options.map((option) => {
                    const isSelected = answers[question.key] === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(question.key, option.value)}
                        className={[
                          'cursor-pointer rounded-xl border border-gray-200 p-4 text-center transition hover:border-gray-400',
                          isSelected
                            ? 'border-gray-900 bg-gray-50 font-semibold'
                            : 'bg-white text-gray-700',
                        ].join(' ')}
                      >
                        <span className="block text-3xl" aria-hidden="true">
                          {option.emoji}
                        </span>
                        <span className="mt-3 block text-sm">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null,
          )}

          {currentQuestionIndex === questions.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Question 4 of 4
              </p>
              <label
                htmlFor="free-text-answer"
                className="mb-6 mt-2 block text-xl font-semibold text-gray-900"
              >
                Anything else we should know?
              </label>
              <textarea
                id="free-text-answer"
                value={freeText}
                maxLength={maxFreeTextLength}
                onChange={(event) => setFreeText(event.target.value)}
                rows={7}
                className="w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-100"
                placeholder="Favorite hobbies, things they already own, delivery notes..."
              />
              <p className="mt-2 text-right text-xs text-gray-400">
                {freeText.length}/{maxFreeTextLength}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={phase === 'loading'}
                  onClick={() => submitQuiz(freeText.trim())}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {phase === 'loading' ? 'Finding...' : 'Continue'}
                </button>
                <button
                  type="button"
                  disabled={phase === 'loading'}
                  onClick={() => submitQuiz('')}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {phase === 'loading' ? (
        <div className="mt-12 flex items-center justify-center rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
            </div>
            <p className="mt-5 text-sm font-medium text-gray-500">Finding your perfect gifts...</p>
          </div>
        </div>
      ) : null}

      {phase === 'results' && result ? (
        <div className="mt-12">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="italic leading-7 text-gray-600">{result.summary}</p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
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
            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
              No catalog matches yet. Try a wider budget or add more context.
            </div>
          ) : null}

          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={startOver}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
