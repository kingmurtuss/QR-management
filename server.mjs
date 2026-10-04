/**
 * Lightweight dev server for QR Field Ops.
 *
 * Serves the static frontend from site/ and emulates the two Netlify Functions
 * (public-config + qr-redirect) so the app works outside Netlify.
 *
 * Run:  node server.mjs          (or: node --watch server.mjs)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = join(__dirname, 'site');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ---- Netlify function: public-config ---- */
async function handlePublicConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    return json(500, {
      error: 'Missing environment variables: SUPABASE_URL and/or SUPABASE_PUBLISHABLE_KEY.',
    });
  }
  return json(200, { supabaseUrl, supabasePublishableKey });
}

/* ---- Netlify function: qr-redirect ---- */
async function handleQrRedirect(req, pathname) {
  const m = pathname.match(/^\/qr\/(QR\d+)\/?$/i);
  const code = m ? m[1].toUpperCase() : '';
  if (!/^QR\d+$/i.test(code)) return json(400, { error: 'Invalid QR code format.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secret) return json(500, { error: 'QR service is not configured.' });

  const headers = { 'content-type': 'application/json', apikey: secret };
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_qr_scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_code: code,
        p_user_agent: req.headers.get('user-agent'),
        p_ip: req.headers.get('x-forwarded-for') || null,
        p_referer: req.headers.get('referer'),
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('resolve_qr_scan failed', res.status, text);
      return json(404, { error: 'QR not found, inactive, or not connected to a review URL.' });
    }
    let payload;
    try { payload = JSON.parse(text); } catch { payload = text; }
    const reviewUrl =
      typeof payload === 'string'
        ? payload
        : payload?.review_url || payload?.google_review_url || payload?.url || null;
    if (!reviewUrl) return json(404, { error: 'Review URL is not configured for this QR.' });

    let target;
    try {
      target = new URL(reviewUrl);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid protocol');
    } catch {
      return json(500, { error: 'Stored review URL is invalid.' });
    }
    return new Response(null, {
      status: 302,
      headers: { location: target.toString(), 'cache-control': 'no-store' },
    });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'QR redirect service failed.' });
  }
}

/* ---- Static file serving with SPA fallback ---- */
async function serveStatic(pathname) {
  // Prevent path traversal
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(SITE_DIR, safe);

  let s = await stat(filePath).catch(() => null);
  if (s && s.isDirectory()) filePath = join(filePath, 'index.html');
  if (!s && !safe.includes('.')) filePath = join(SITE_DIR, 'index.html'); // SPA fallback

  try {
    const body = await readFile(filePath);
    const ct = MIME[extname(filePath)] || 'application/octet-stream';
    return new Response(body, { headers: { 'content-type': ct, 'cache-control': 'no-cache' } });
  } catch {
    // Final fallback to index.html for SPA routes
    try {
      const body = await readFile(join(SITE_DIR, 'index.html'));
      return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    } catch {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    let response;
    if (pathname === '/.netlify/functions/public-config') {
      response = await handlePublicConfig();
    } else if (pathname.startsWith('/qr/')) {
      response = await handleQrRedirect(req, pathname);
    } else {
      response = await serveStatic(pathname);
    }
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Field Ops dev server running on http://0.0.0.0:${PORT}`);
});
