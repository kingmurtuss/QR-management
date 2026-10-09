import { publicBusiness } from '../lib/review-assistant.mjs';
export const config = {
  path: "/qr/:code"
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getCode(req, context) {
  const param = context?.params?.code;
  if (param) return String(param).trim().toUpperCase();

  const url = new URL(req.url);
  const q = url.searchParams.get("code");
  if (q) return q.trim().toUpperCase();

  const m = url.pathname.match(/\/qr\/(QR\d+)\/?$/i);
  return m ? m[1].toUpperCase() : "";
}

export default async (req, context) => {
  const code = getCode(req, context);

  if (!/^QR\d+$/i.test(code)) {
    return json(400, { error: "Invalid QR code format." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secret) {
    return json(500, { error: "QR service is not configured." });
  }

  const headers = {
    "content-type": "application/json",
    "apikey": secret
  };

  // Legacy service_role keys are JWTs and should also be sent as Bearer tokens.
  // Modern sb_secret_... keys are opaque and must not be treated as JWTs.
  if (!secret.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secret}`;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_qr_scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_code: code,
        p_user_agent: req.headers.get("user-agent"),
        p_ip: req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || null,
        p_referer: req.headers.get("referer")
      })
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("resolve_qr_scan failed", res.status, text);
      return json(404, { error: "QR not found, inactive, or not connected to a review URL." });
    }

    let payload;
    try { payload = JSON.parse(text); } catch { payload = text; }

    const reviewUrl =
      typeof payload === "string"
        ? payload
        : payload?.review_url || payload?.google_review_url || payload?.url || null;

    if (!reviewUrl) {
      return json(404, { error: "Review URL is not configured for this QR." });
    }

    let target;
    try {
      target = new URL(reviewUrl);
      if (!["http:", "https:"].includes(target.protocol)) throw new Error("Invalid protocol");
    } catch {
      return json(500, { error: "Stored review URL is invalid." });
    }

    // The same permanent printed QR routes to the optional assistant.
    // Lookup failure falls back to the original Google destination.
    try {
      const business = await publicBusiness(code);
      if (business?.enabled) target = new URL(`/review.html?code=${encodeURIComponent(code)}`, req.url);
    } catch (error) {
      console.warn('Review add-on lookup unavailable; using direct review route.');
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: target.toString(),
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: "QR redirect service failed." });
  }
};
