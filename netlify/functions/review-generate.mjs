import { json, readBody, publicBusiness, generateExperienceReview } from '../lib/review-assistant.mjs';
import { validateExperience, validateRecentReviews } from '../../site/review-experience.mjs';
export const config = { rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body, input, previousReviews;
  try { body = await readBody(req); input = validateExperience(body); previousReviews = validateRecentReviews(body.previousReviews); }
  catch (e) { return json(400, { error: e.message }); }
  try {
    const b = await publicBusiness(String(body.code || '').toUpperCase());
    if (!b) return json(404, { error: 'This review assistant is not enabled for this QR card.' });
    return json(200, { ...await generateExperienceReview(input, b, previousReviews), reviewUrl: b.review_url });
  } catch { return json(503, { error: 'Suggestions are temporarily unavailable. You can still write your review directly on Google.' }); }
};
