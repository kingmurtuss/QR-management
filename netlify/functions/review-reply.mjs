import { json, readBody, authorizedBusiness, validateInput, generateDrafts, db } from '../lib/review-assistant.mjs';
export const config = { rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body, input;
  try { body = await readBody(req); input = validateInput(body); }
  catch (e) { return json(400, { error: e.message }); }
  try {
    const account = await authorizedBusiness(req, body.businessId);
    if (!account) return json(403, { error: 'Sign in with an active account assigned to this business.' });
    const result = await generateDrafts(input, account.business.name, 'reply');
    await db('review_reply_drafts', {
      method: 'POST',
      body: JSON.stringify({ business_id: account.business.id, created_by: account.userId, review_text: input.text, rating: input.rating, language: result.language, drafts: result.drafts, source: result.source })
    }, account.token);
    return json(200, result);
  } catch { return json(503, { error: 'Could not generate and save the reply drafts. Please try again shortly.' }); }
};
