# YAM Table restaurant module

Open `/restaurants/` and sign in with an existing QR Field Ops account. Administrators can manage all venues; other active accounts manage only the venues they own. The original QR review redirects and field operations remain available at `/`.

Create a venue, add menu items, enter guest Wi-Fi and review links, configure a loyalty reward, and publish. The permanent guest link is `/restaurants/?venue=your-slug`. Print or download its QR from **QR & table card**. Changing content does not change this link.

## Included

- Multiple branded restaurant pages, dish categories, search, prices, photos, allergens, dietary labels and sold-out states.
- Guest Wi-Fi credentials, copy-password button and standard Wi-Fi QR.
- Private feedback with food/service ratings, resolution tracking and CSV export.
- Optional Google review link shown equally to every guest regardless of rating.
- Browser-based loyalty cards protected by random 256-bit tokens; only token hashes are stored server-side. Staff stamp and redeem cards using an atomic RLS-enforced SQL function.
- Restaurant dashboards, scan/feature analytics, loyalty members and QR table cards.
- Phone and desktop layouts. `/restaurants/?venue=demo` is a clearly labelled fictional demo.

## Deployment

Run `restaurant_setup.sql` once on the existing Supabase project. It is an additive schema using explicit venue ownership RLS policies. Guests have no direct access to the restaurant tables; the Netlify function validates requests and applies an IP/domain rate limit. The endpoint uses the already configured `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Dashboard auth uses the existing public-config function.

`netlify.toml` publishes `site` and routes `/restaurants/*` to its dedicated page. No build command or new dependencies are required. `.netlify` is ignored and must never be committed.

Verify with `node --test tests/restaurant-api.test.mjs` and `node --check site/restaurants/app.js`. Check Supabase security advisors after applying the schema.

## Practical limits

This is a browser product, without native App Clips, signed Apple/Google Wallet passes, automatic Instagram import, AI menu OCR, bulk messaging, payment collection or subscriptions. Native wallet passes require issuer credentials and signing infrastructure. Menus are edited manually and photos use HTTPS URLs. No ordering or checkout is promised by the guest page.

Loyalty cards stay in the same browser/device; clearing storage loses access. Staff should match the full card ID before issuing stamps. Dashboard lists show the latest 1,000 members and feedback records; event analytics query the last 30 days, up to 10,000 records. Wi-Fi details are public when enabled: use a dedicated guest network.

Do not reward Google reviews, filter access to public reviews by rating, or claim that a click confirms a posted review. Private feedback submissions and public reviews are separate.
