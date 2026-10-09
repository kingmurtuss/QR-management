import { json, publicBusiness } from '../lib/review-assistant.mjs';
export default async req => {
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed.' });
  const code = (new URL(req.url).searchParams.get('code') || '').toUpperCase();
  try {
    const b = await publicBusiness(code);
    if (!b) return json(404, { error: 'This review assistant is unavailable or has not been enabled.' });
    return json(200, { name: b.name, reviewUrl: b.review_url, language: b.default_language });
  } catch { return json(503, { error: 'The review page could not load. Please try again shortly.' }); }
};
