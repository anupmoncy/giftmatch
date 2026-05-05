import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedCatalogPage } from '../pages/SavedCatalog.js';

const mockState = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: mockState.getSession,
    },
    from: mockState.from,
  },
}));

const session = {
  user: {
    id: 'user-1',
  },
};

function renderSavedCatalog() {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route path="/catalog" element={<SavedCatalogPage />} />
        <Route path="/login" element={<h1>Login</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockState.getSession.mockResolvedValue({
    data: { session },
    error: null,
  });
  mockState.from.mockReturnValue({
    select: mockState.select,
  });
  mockState.select.mockReturnValue({
    eq: mockState.eq,
  });
  mockState.eq.mockReturnValue({
    order: mockState.order,
  });
  mockState.order.mockResolvedValue({
    data: [
      {
        id: 'saved-1',
        catalog_item_id: 'catalog-1',
        recommendation_run_id: 'recommendation-run-1',
        notes: 'A useful little ritual for sketching ideas.',
        created_at: '2026-05-05T10:00:00.000Z',
        catalog: {
          id: 'catalog-1',
          name: 'Studio Sketch Journal',
          description: 'A guided sketch journal.',
          price: 28,
          image_url: 'https://example.com/sketch.jpg',
          brand: 'Paper Co',
          category: 'Art',
          subcategory: 'Drawing',
        },
      },
    ],
    error: null,
  });
});

describe('SavedCatalogPage', () => {
  it('shows saved gifts joined with catalog details', async () => {
    renderSavedCatalog();

    expect(await screen.findByRole('heading', { name: /your saved gifts/i })).toBeInTheDocument();
    expect(screen.getByText('Studio Sketch Journal')).toBeInTheDocument();
    expect(screen.getByText('$28')).toBeInTheDocument();
    expect(screen.getByText('A useful little ritual for sketching ideas.')).toBeInTheDocument();
    expect(screen.getByText('Art')).toBeInTheDocument();
    expect(screen.getByText('Drawing')).toBeInTheDocument();
    expect(screen.getByText('Paper Co')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /drawing gift image/i })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg\+xml/),
    );

    expect(mockState.from).toHaveBeenCalledWith('saved_gifts');
    expect(mockState.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockState.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('redirects signed-out visitors to login', async () => {
    mockState.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    renderSavedCatalog();

    expect(await screen.findByRole('heading', { name: /login/i })).toBeInTheDocument();
    expect(mockState.from).not.toHaveBeenCalled();
  });
});
