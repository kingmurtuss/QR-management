import { json, readBody, publicBusiness, validateInput, generateDrafts } from '../lib/review-assistant.mjs';
export const config = { rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  let body, input;
  try { body = await readBody(req); input = validateInput(body); }
  catch (e) { return json(400, { error: e.message }); }
  try {
    const b = await publicBusiness(String(body.code || '').toUpperCase());
    if (!b) return json(404, { error: 'This review assistant is not enabled for this QR card.' });
    return json(200, await generateDrafts(input, b.name));
  } catch { return json(503, { error: 'Suggestions are temporarily unavailable. You can still write your review directly on Google.' }); }
};
