import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import type { GiftRecommendation } from '../services/findGifts.js';

type GiftCardProps = {
  gift: GiftRecommendation;
  recommendationRunId: string | null;
};

const confidenceStyles = {
  high: 'border border-emerald-100 bg-emerald-50 text-emerald-600',
  medium: 'border border-amber-100 bg-amber-50 text-amber-600',
  low: 'border border-gray-200 bg-gray-50 text-gray-400',
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
  const [imageFailed, setImageFailed] = useState(false);
  const score = Math.max(0, Math.min(100, Math.round(gift.score)));
  const imageUrl = gift.item.image_url?.trim();
  const showImage = Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

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
    <article className="flex flex-row items-start gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-indigo-100 hover:shadow-md">
      {showImage ? (
        <img
          src={imageUrl}
          alt={gift.item.name}
          className="h-16 w-16 flex-shrink-0 rounded-xl bg-gray-50 object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-2xl">
          <span aria-hidden="true">🎁</span>
          <span className="sr-only">No image</span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight text-gray-900">{gift.item.name}</h2>
            {gift.rank === 1 ? (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                <span aria-hidden="true">🏆</span>
                Best match
              </span>
            ) : null}
          </div>
          <p className="flex-shrink-0 text-sm font-bold text-indigo-600">
            {formatPrice(gift.item.price)}
          </p>
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{gift.reason}</p>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
              {gift.gift_angle}
            </span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                confidenceStyles[gift.confidence],
              ].join(' ')}
            >
              {gift.confidence}
            </span>
          </div>
          <button
            type="button"
            onClick={saveGift}
            disabled={isSaving || saved}
            className={[
              'flex-shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed',
              saved
                ? 'border-indigo-500 bg-indigo-500 text-white'
                : 'border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600',
            ].join(' ')}
          >
            {isSaving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-400"
            style={{ width: `${score}%` }}
          />
        </div>

        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    </article>
  );
}
