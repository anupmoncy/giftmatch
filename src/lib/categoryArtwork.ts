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

function escapeSvgText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSubcategoryArtworkDataUri(category: string, subcategory: string) {
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
