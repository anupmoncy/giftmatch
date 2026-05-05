import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizPage } from '../pages/Quiz.js';
import { requestQuizReset } from '../lib/quizReset.js';

const mockState = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  findGifts: vi.fn(),
  warmBudgetCatalog: vi.fn(),
}));

vi.mock('../lib/auth.js', () => ({
  checkAuth: mockState.checkAuth,
}));

vi.mock('../lib/apiClient.js', () => ({
  findGifts: mockState.findGifts,
  preloadGiftAuth: vi.fn(),
  warmBudgetCatalog: mockState.warmBudgetCatalog,
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

const result = {
  quizRunId: 'quiz-run-1',
  recommendationRunId: 'recommendation-run-1',
  promptVersion: 'giftmatch-rank-v1',
  model: 'gpt-4o-mini',
  summary: 'These are warm, useful picks.',
  recommendations: [
    {
      catalog_item_id: 'catalog-1',
      rank: 1,
      score: 95,
      reason: 'It gives them an easy creative ritual.',
      gift_angle: 'Creative daily practice',
      confidence: 'high',
      item: {
        id: 'catalog-1',
        name: 'Studio Journal',
        description: 'A guided journal.',
        price: 24,
        image_url: null,
        brand: 'Paper Co',
        category: 'Stationery',
        subcategory: 'Journals',
      },
    },
  ],
};

function renderQuiz() {
  return render(
    <MemoryRouter>
      <QuizPage />
    </MemoryRouter>,
  );
}

function answerFirstThreeQuestions() {
  fireEvent.click(screen.getByRole('button', { name: /\$25-\$50/i }));
  fireEvent.click(screen.getByRole('button', { name: /friend/i }));
  fireEvent.click(screen.getByRole('button', { name: /creative/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.checkAuth.mockResolvedValue({
    access_token: 'access-token',
    user: { id: 'user-1' },
  });
  mockState.findGifts.mockResolvedValue(result);
  mockState.warmBudgetCatalog.mockResolvedValue(undefined);
});

describe('QuizPage', () => {
  it('renders all quiz questions on load', async () => {
    renderQuiz();

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "What's the budget?",
      'Who is this for?',
      "What's their personality?",
      'Anything else we should know?',
    ]);
    expect(screen.getByRole('heading', { name: /who is this for/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /personality/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /budget/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/anything else/i)).toBeInTheDocument();
  });

  it('submit is disabled until Q1-Q3 are answered', async () => {
    renderQuiz();

    const submitButton = await screen.findByRole('button', { name: /find perfect gifts/i });
    expect(submitButton).toBeDisabled();

    answerFirstThreeQuestions();
    expect(submitButton).not.toBeDisabled();
  });

  it('submitting triggers findGifts with all answers', async () => {
    renderQuiz();
    answerFirstThreeQuestions();
    fireEvent.change(await screen.findByLabelText(/anything else/i), {
      target: { value: 'They love weekend hikes.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /find perfect gifts/i }));

    await waitFor(() => {
      expect(mockState.findGifts).toHaveBeenCalledWith({
        recipient: 'friend',
        personality: 'creative',
        budget: '25-50',
        freeText: 'They love weekend hikes.',
      });
    });
  });

  it('submitting with blank Q4 triggers findGifts with empty freeText', async () => {
    renderQuiz();
    answerFirstThreeQuestions();

    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));

    await waitFor(() => {
      expect(mockState.findGifts).toHaveBeenCalledWith({
        recipient: 'friend',
        personality: 'creative',
        budget: '25-50',
        freeText: '',
      });
    });
  });

  it('preloads the budget catalog as soon as budget is selected', async () => {
    renderQuiz();
    fireEvent.click(await screen.findByRole('button', { name: /\$25-\$50/i }));

    await waitFor(() => {
      expect(mockState.warmBudgetCatalog).toHaveBeenCalledWith({
        budget: '25-50',
      });
    });
    expect(mockState.warmBudgetCatalog).toHaveBeenCalledWith({ budget: 'flexible' });

    fireEvent.click(screen.getByRole('button', { name: /friend/i }));
    fireEvent.click(screen.getByRole('button', { name: /creative/i }));
    expect(mockState.warmBudgetCatalog).toHaveBeenCalledTimes(2);
  });

  it('preloads exact budget before click when a budget option receives intent', async () => {
    renderQuiz();
    const budgetButton = await screen.findByRole('button', { name: /\$50-\$100/i });

    fireEvent.pointerEnter(budgetButton);

    await waitFor(() => {
      expect(mockState.warmBudgetCatalog).toHaveBeenCalledWith({ budget: '50-100' });
    });
  });

  it('renders a loading match note while findGifts is in flight', async () => {
    let resolveRequest!: (value: typeof result) => void;
    mockState.findGifts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderQuiz();
    answerFirstThreeQuestions();

    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));

    expect(await screen.findByText(/building your shortlist/i)).toBeInTheDocument();
    expect(screen.getByText(/match note/i)).toBeInTheDocument();
    expect(screen.getByText(/elapsed 0s/i)).toBeInTheDocument();
    expect(screen.getByText(/free-text refined/i)).toBeInTheDocument();
    resolveRequest(result);
  });

  it('renders results after findGifts resolves with ranked items', async () => {
    renderQuiz();
    answerFirstThreeQuestions();

    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));

    expect(await screen.findByText('Studio Journal')).toBeInTheDocument();
    expect(screen.getByText(result.summary)).toBeInTheDocument();
  });

  it('renders an error message when findGifts rejects', async () => {
    mockState.findGifts.mockRejectedValueOnce(new Error('Could not rank gifts.'));
    renderQuiz();
    answerFirstThreeQuestions();

    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));

    expect(await screen.findByText('Could not rank gifts.')).toBeInTheDocument();
  });

  it('Start over resets to Q1', async () => {
    renderQuiz();
    answerFirstThreeQuestions();
    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start over/i }));

    expect(await screen.findByRole('heading', { name: /who is this for/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find perfect gifts/i })).toBeDisabled();
  });

  it('resets the quiz when the logo requests a fresh match', async () => {
    renderQuiz();
    answerFirstThreeQuestions();
    fireEvent.click(await screen.findByRole('button', { name: /find perfect gifts/i }));

    expect(await screen.findByText('Studio Journal')).toBeInTheDocument();

    act(() => {
      requestQuizReset();
    });

    expect(await screen.findByRole('heading', { name: /who is this for/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find perfect gifts/i })).toBeDisabled();
  });
});
