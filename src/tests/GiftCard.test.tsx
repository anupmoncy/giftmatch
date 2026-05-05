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
    age_tags: ['pre-teen', 'teen', 'young-adult'],
  },
} satisfies GiftRecommendation;

describe('GiftCard', () => {
  it('falls back when the catalog image fails to load', () => {
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

    fireEvent.error(screen.getByRole('img', { name: /studio journal/i }));

    expect(screen.queryByRole('img', { name: /studio journal/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    expect(screen.getByText('📱')).toBeInTheDocument();
  });

  it('falls back when the catalog image URL is blank', () => {
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

    expect(screen.queryByRole('img', { name: /studio journal/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    expect(screen.getByText('👜')).toBeInTheDocument();
  });
});
