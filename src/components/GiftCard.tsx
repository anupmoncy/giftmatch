import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import type { GiftRecommendation } from '../services/findGifts.js';

type GiftCardProps = {
  gift: GiftRecommendation;
  recommendationRunId: string | null;
};

const confidenceStyles = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
} satisfies Record<GiftRecommendation['confidence'], string>;

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function GiftCard({ gift, recommendationRunId }: GiftCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const score = Math.max(0, Math.min(100, Math.round(gift.score)));

  async function saveGift() {
    setError('');
    setIsSaving(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setIsSaving(false);
      setError('Sign in with a confirmed account to save this gift.');
      return;
    }

    const { error: saveError } = await supabase.from('saved_gifts').insert({
      user_id: session.user.id,
      catalog_item_id: gift.catalog_item_id,
      recommendation_run_id: recommendationRunId,
      notes: gift.reason,
    });

    setIsSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSaved(true);
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {gift.item.image_url ? (
        <img
          src={gift.item.image_url}
          alt={gift.item.name}
          className="aspect-square w-full rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
          No image
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold leading-6 text-gray-900">{gift.item.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{formatPrice(gift.item.price)}</p>
          </div>
          <span
            className={[
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              confidenceStyles[gift.confidence],
            ].join(' ')}
          >
            {gift.confidence}
          </span>
        </div>

        <p className="mt-1 text-sm italic leading-6 text-gray-600">{gift.reason}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {gift.gift_angle}
          </span>
          <span className="text-xs text-gray-400">Rank #{gift.rank}</span>
        </div>

        <div className="mt-4">
          <div className="h-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-900" style={{ width: `${score}%` }} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveGift}
            disabled={isSaving || saved}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          {saved ? <span className="text-sm font-medium text-green-700">✓ Saved</span> : null}
        </div>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </article>
  );
}
