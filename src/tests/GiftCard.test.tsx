import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GiftCard } from '../components/GiftCard.js';
import type { GiftRecommendation } from '../services/findGifts.js';

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

const gift = {
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
    image_url: 'https://example.com/journal.jpg',
    brand: 'Paper Co',
    category: 'Stationery',
    subcategory: 'Journals',
  },
} satisfies GiftRecommendation;

describe('GiftCard', () => {
  it('uses subcategory artwork instead of item-specific catalog images', () => {
    render(<GiftCard gift={gift} recommendationRunId="recommendation-run-1" />);

    const image = screen.getByRole('img', { name: /journals gift image/i });

    expect(image).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getByText('Stationery')).toBeInTheDocument();
    expect(screen.getByText('Journals')).toBeInTheDocument();
  });

  it('falls back when the subcategory artwork fails to load', () => {
    render(
      <GiftCard
        gift={{
          ...gift,
          item: {
            ...gift.item,
            category: 'Electronics',
          },
        }}
        recommendationRunId="recommendation-run-1"
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: /journals gift image/i }));

    expect(screen.queryByRole('img', { name: /journals gift image/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no subcategory image/i)).toBeInTheDocument();
    expect(screen.getByText('JO')).toBeInTheDocument();
  });

  it('uses subcategory artwork when the catalog image URL is blank', () => {
    render(
      <GiftCard
        gift={{
          ...gift,
          item: {
            ...gift.item,
            image_url: '   ',
            category: 'Fashion & Accessories',
          },
        }}
        recommendationRunId="recommendation-run-1"
      />,
    );

    expect(screen.getByRole('img', { name: /journals gift image/i })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
  });
});
