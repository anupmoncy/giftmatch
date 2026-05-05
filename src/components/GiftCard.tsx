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

const categoryArtworkStyles: Record<string, { from: string; to: string; accent: string }> = {
  Art: { from: '#FFF7ED', to: '#FDF2F8', accent: '#EA580C' },
  Books: { from: '#EFF6FF', to: '#EEF2FF', accent: '#4F46E5' },
  Electronics: { from: '#EEF2FF', to: '#ECFEFF', accent: '#2563EB' },
  Games: { from: '#F5F3FF', to: '#ECFDF5', accent: '#7C3AED' },
  Garden: { from: '#ECFDF5', to: '#F7FEE7', accent: '#16A34A' },
  'Food & Drink': { from: '#FFF7ED', to: '#FEF3C7', accent: '#D97706' },
  Home: { from: '#F8FAFC', to: '#F1F5F9', accent: '#64748B' },
  Kitchen: { from: '#FFFBEB', to: '#FFF7ED', accent: '#F97316' },
  Office: { from: '#F8FAFC', to: '#EEF2FF', accent: '#4F46E5' },
  Outdoors: { from: '#ECFDF5', to: '#F0FDFA', accent: '#059669' },
  Stationery: { from: '#FDF2F8', to: '#EEF2FF', accent: '#DB2777' },
  Travel: { from: '#EFF6FF', to: '#F0FDFA', accent: '#0891B2' },
  Wellness: { from: '#FDF2F8', to: '#FFF1F2', accent: '#E11D48' },
};

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

function escapeSvgText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSubcategoryArtworkDataUri(category: string, subcategory: string) {
  const style = categoryArtworkStyles[category] ?? {
    from: '#F8FAFC',
    to: '#EEF2FF',
    accent: '#6366F1',
  };
  const label = escapeSvgText(subcategory.slice(0, 18));
  const initials = escapeSvgText(
    subcategory
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || 'G',
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${style.from}"/><stop offset="1" stop-color="${style.to}"/></linearGradient></defs><rect width="160" height="160" rx="30" fill="url(#bg)"/><circle cx="122" cy="34" r="24" fill="${style.accent}" opacity=".16"/><circle cx="33" cy="126" r="34" fill="#fff" opacity=".62"/><rect x="36" y="38" width="88" height="72" rx="22" fill="#fff" opacity=".88"/><path d="M56 91h48M56 74h48M64 57h32" stroke="${style.accent}" stroke-width="7" stroke-linecap="round" opacity=".35"/><circle cx="80" cy="74" r="28" fill="${style.accent}" opacity=".12"/><text x="80" y="84" fill="${style.accent}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" text-anchor="middle">${initials}</text><text x="80" y="136" fill="#111827" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" text-anchor="middle">${label}</text></svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function GiftCard({ gift, recommendationRunId }: GiftCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const score = Math.max(0, Math.min(100, Math.round(gift.score)));
  const subcategoryArtworkUrl = buildSubcategoryArtworkDataUri(
    gift.item.category,
    gift.item.subcategory,
  );
  const showImage = !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [subcategoryArtworkUrl]);

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
          src={subcategoryArtworkUrl}
          alt={`${gift.item.subcategory} gift image`}
          className="h-16 w-16 flex-shrink-0 rounded-xl bg-gray-50 object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className={[
            'flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-bold text-gray-400',
          ].join(' ')}
        >
          <span aria-hidden="true">{gift.item.subcategory.slice(0, 2).toUpperCase()}</span>
          <span className="sr-only">No subcategory image</span>
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
            <span className="truncate rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
              {gift.item.category}
            </span>
            <span className="truncate rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
              {gift.item.subcategory}
            </span>
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
