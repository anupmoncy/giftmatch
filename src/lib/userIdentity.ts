const internalUsernameEmailDomain = 'users.giftmatch.app';

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toInternalEmailLocalPart(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[._-]{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  return normalized || 'giftmatch-user';
}

export function normalizeAuthIdentifier(usernameOrEmail: string) {
  const value = usernameOrEmail.trim();

  if (isEmailLike(value)) {
    return value.toLowerCase();
  }

  return `${toInternalEmailLocalPart(value)}@${internalUsernameEmailDomain}`;
}
