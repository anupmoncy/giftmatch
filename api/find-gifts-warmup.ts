import { getAuthenticatedUserId } from './_auth.js';
import type { VercelRequest, VercelResponse } from './_auth.js';
import { warmGiftSearch } from '../src/services/findGifts.js';
import type { GiftWarmupAnswers } from '../src/services/findGifts.js';

function isValidAnswers(value: unknown): value is GiftWarmupAnswers {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GiftWarmupAnswers>;

  return typeof candidate.budget === 'string' && candidate.budget.trim().length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestBody = req.body as { answers?: GiftWarmupAnswers };
    const answers = requestBody.answers ?? (req.body as GiftWarmupAnswers);

    if (!isValidAnswers(answers)) {
      res.status(400).json({ error: 'Missing or malformed gift answers' });
      return;
    }

    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await warmGiftSearch({ budget: answers.budget });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.warn('find-gifts warmup failed', error);
    res.status(200).json({ ok: false });
  }
}
