import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildSubcategoryArtworkDataUri } from '../lib/categoryArtwork.js';
import { formatDate, formatPrice } from '../lib/formatters.js';
import { supabase } from '../lib/supabase.js';

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  brand: string;
  category: string;
  subcategory: string;
};

type SavedGiftRow = {
  id: string;
  catalog_item_id: string;
  recommendation_run_id: string | null;
  notes: string | null;
  created_at: string;
  catalog: CatalogItem | CatalogItem[] | null;
};

function asCatalogItem(value: SavedGiftRow['catalog']) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function SavedCatalogPage() {
  const navigate = useNavigate();
  const [savedGifts, setSavedGifts] = useState<SavedGiftRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadSavedGifts() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user) {
          navigate('/login', { replace: true });
          return;
        }

        const { data, error: savedError } = await supabase
          .from('saved_gifts')
          .select(
            'id, catalog_item_id, recommendation_run_id, notes, created_at, catalog:catalog_item_id(id, name, description, price, image_url, brand, category, subcategory)',
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (savedError) {
          throw savedError;
        }

        if (isMounted) {
          setSavedGifts((data ?? []) as SavedGiftRow[]);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load your saved gifts.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSavedGifts();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const savedCatalogItems = savedGifts
    .map((savedGift) => ({ savedGift, item: asCatalogItem(savedGift.catalog) }))
    .filter(
      (entry): entry is { savedGift: SavedGiftRow; item: CatalogItem } => entry.item !== null,
    );

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
            Saved catalog
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">Your saved gifts</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            A catalog view of only the gift ideas you saved from your recommendation results.
          </p>
        </div>
        <Link
          to="/quiz"
          className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
        >
          Find more gifts
        </Link>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-gray-100 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : savedCatalogItems.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">No saved gifts yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Save a recommendation and it will appear here as a personal catalog.
          </p>
          <Link
            to="/quiz"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Start a gift search
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedCatalogItems.map(({ savedGift, item }) => {
            const artworkUrl = buildSubcategoryArtworkDataUri(item.category, item.subcategory);

            return (
              <article
                key={savedGift.id}
                className="flex min-h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-indigo-100 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={artworkUrl}
                    alt={`${item.subcategory} gift image`}
                    className="h-20 w-20 flex-shrink-0 rounded-2xl bg-gray-50 object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-semibold leading-tight text-gray-900">
                        {item.name}
                      </h2>
                      <p className="flex-shrink-0 text-sm font-bold text-indigo-600">
                        {formatPrice(item.price)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium text-gray-400">
                      Saved {formatDate(savedGift.created_at)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-500">
                  {savedGift.notes || item.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                    {item.category}
                  </span>
                  <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600">
                    {item.subcategory}
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                    {item.brand}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
