# YAM Table restaurant module

Agents use the **Set up Restaurant** entry in the existing QR workspace sidebar. It opens `/restaurants/?setup=1` and a three-step restaurant onboarding form: restaurant identity, branding, and guest features. The agent then adds the menu and publishes a restaurant QR. Existing authentication is shared for convenience. `/restaurants/?agent-demo=1&setup=1` provides a labelled agent setup demo with changes stored only in the browser. Administrators can manage all venues; other active accounts manage only the venues they own. Restaurant and Google-review QR workflows use separate records and screens. Restaurant onboarding never allocates, activates, changes or writes Google-review QR cards, businesses, scan records or commissions. The only change to the existing QR app is the new sidebar entry; all its JavaScript and Google-review functions are untouched.

Each restaurant has an independent `REST-...` identifier, its own permanent guest link, branding, menus, guest Wi-Fi, loyalty reward and optional restaurant review link. Create a venue, add menu items, configure its guest features, and publish. The permanent guest link is `/restaurants/?venue=your-slug`. Print or download its QR from **QR & table card**. Changing content does not change this link.

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

## Appearance and membership QR

Both dashboards share `appearance.css` and `appearance.js`: frosted glass, copper accents, Outfit headings and Plus Jakarta Sans text. A floating light/dark toggle is available on sign-in, workspace and guest screens; its preference persists in this browser and synchronises across tabs on the same origin. The two apps retain independent data and business logic.

A loyalty QR encodes the full member ID as plain text. It is not a web link and does not add stamps automatically. Staff match the ID in Loyalty members before stamping or redeeming. The guest page explains this beside one square code; canvas and image are no longer displayed together. QR codes retain a white background in either theme and in print.
