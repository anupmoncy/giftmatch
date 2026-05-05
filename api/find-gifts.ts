import { getAuthenticatedUserId } from './_auth.js';
import type { VercelRequest, VercelResponse } from './_auth.js';
import { findGifts } from '../src/services/findGifts.js';
import type { GiftAnswers } from '../src/services/findGifts.js';

function isValidAnswers(value: unknown): value is GiftAnswers {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof GiftAnswers, unknown>>;

  return (
    typeof candidate.recipient === 'string' &&
    candidate.recipient.trim().length > 0 &&
    typeof candidate.personality === 'string' &&
    candidate.personality.trim().length > 0 &&
    typeof candidate.budget === 'string' &&
    candidate.budget.trim().length > 0 &&
    (candidate.freeText === undefined || typeof candidate.freeText === 'string')
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestBody = req.body as { answers?: GiftAnswers };
    const answers = requestBody.answers ?? (req.body as GiftAnswers);

    if (!isValidAnswers(answers)) {
      res.status(400).json({ error: 'Missing or malformed gift answers' });
      return;
    }

    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await findGifts(answers, { userId });

    res.status(200).json({
      ...result,
      rankedGifts: result.recommendations,
    });
  } catch (error) {
    console.error('find-gifts failed', error);
    res.status(500).json({ error: 'Could not find gifts' });
  }
}
