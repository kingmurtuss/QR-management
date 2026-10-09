# QR Field Ops

A Netlify + Supabase field-sales system for permanent Google Review QR cards.

## What is included

- Google OAuth + email/password login through Supabase Auth
- New signups default to **worker**
- Admin / worker dashboards
- Permanent database-sequence QR IDs such as `QR00001`
- Worker QR allocation
- Business onboarding with Google Review URL and GPS coordinates
- Dynamic redirect: `/qr/QR00001` -> current Google Review destination
- Scan count/history
- Commission, withdrawals, tickets and appointments
- CSV exports
- Premium portrait Google Review card preview + print design
- UI state persistence: switching browser tabs no longer resets the dashboard page/scroll position
- Admin-only **single and bulk deletion of completely unused QR codes**
- Database trigger that blocks deletion of assigned, active, business-linked or scanned QR history

## Repository structure

```
.
├── netlify.toml
├── package.json
├── supabase_setup.sql
├── .env.example
├── site/
│   ├── index.html
│   ├── app-core.js
│   ├── app-pages-a.js
│   ├── app-pages-b.js
│   ├── app-actions-a.js
│   ├── app-actions-b.js
│   ├── styles-base.css
│   ├── styles-premium.css
│   └── assets/favicon.svg
└── netlify/functions/
    ├── public-config.mjs
    └── qr-redirect.mjs
```

## 1. Supabase database

Open **Supabase -> SQL Editor**, paste the complete contents of `supabase_setup.sql`, and run it.

Then promote only your trusted admin account:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'YOUR_ADMIN_EMAIL@example.com';
```

Do not add an admin-role selector to public signup.

## 2. Netlify environment variables

Set these in **Netlify -> Project configuration -> Environment variables**:

```env
SUPABASE_URL=https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_OR_LEGACY_SERVICE_ROLE_KEY
```

Use Netlify environment variables only. Never commit real keys into this repository.

`SUPABASE_SERVICE_ROLE_KEY` supports either a modern `sb_secret_...` key or a legacy Supabase `service_role` JWT. The QR redirect function keeps this key server-side.

## 3. Supabase Auth URLs

For production, configure your Netlify site as the Supabase Site URL and allow-list the same production URL as an Auth redirect.

Google Cloud's OAuth redirect URI must be the **Supabase Auth callback**, not the Netlify URL:

```
https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

## 4. QR URL

Set the QR base URL in Admin -> Settings to:

```
https://YOUR-DOMAIN/qr/
```

New cards become:

```
https://YOUR-DOMAIN/qr/QR00001
```

Previously printed legacy links such as `https://YOUR-DOMAIN/#/QR00001` are converted to the server redirect route.

## Unused QR deletion

The Admin QR Inventory page has:

- **Delete unused** on individual safe-to-delete rows
- checkboxes to select unused QR codes
- **Select all unused**
- **Delete selected**

A QR can only be deleted when all of the following are true:

- status is `available`
- no worker is assigned
- no business is linked
- no assignment timestamp
- no activation timestamp
- scan count is zero
- no scan-history row exists

This is enforced twice: in the UI/RLS policy and by a database trigger. Deleted QR numbers are **never reused** because new IDs are created from a Postgres sequence.

## Keeping your place when switching tabs

The app does not intentionally refresh when the browser tab becomes hidden/visible. It stores, per signed-in user, the current dashboard page and scroll position for each page. If the browser actually unloads/reloads the page, the workspace is restored to the same section after Supabase restores the session.

## Premium review card

Open **QR Inventory -> Preview / Print**.

The card designer offers six professional themes and four QR patterns. Signature rounded preserves the established Google review QR artwork; the other patterns use standard corner markers for reliable scanning. Choose a theme, print a 54 × 85.6 mm PVC card, or download a complete 1800px PNG, a vector SVG, or a 1520px QR-only PNG. The same master card is used for preview, printing and downloads. Design preferences are stored for each QR in the current browser. Preview all designs at `/qr-designs/` (clearly labelled demo destinations).

The QR itself contains only your dynamic `/qr/...` URL, so a business's Google Review URL can be edited later without reprinting the physical QR card.

## Optional review assistant add-on

The **Review Assistant** sidebar page lets admins enable the add-on per business and choose English, Hindi, or Telugu. Existing physical `/qr/QRxxxxx` cards then redirect to the customer assistant; businesses with the add-on off keep their original direct Google Review redirect.

Apply `supabase/migrations/20261009043909_review_assistant_addon.sql` once to an existing installation, after the base schema. It adds two RLS-protected tables. The migration does not enable the add-on for any business. Workers can view settings and generate/read replies only for their explicitly assigned businesses, with active admin access to all businesses. These checks also remain effective if base business visibility later broadens. Only admins can change add-on settings.

Customer flow: scan the activated business QR, tap an overall rating and 1–3 things that actually happened, then tap **Generate Review**. AI writes a natural, conversational review using only these selected facts and preserving the rating, including criticism and mixed experiences. No typing or confirmation checkbox is required, and no rating or fact is selected by default. The text is copied before redirecting to the business's Google Review page; the customer checks/edits it, pastes, sets their rating on Google and submits. All ratings use the same destination. If the browser denies asynchronous clipboard permission, the generated text stays visible with a **Copy & open Google** button and a manual-copy fallback. Repeated generations vary the phrasing and sentence order while avoiding the last eight drafts in the current browser tab, including after a refresh. Live AI receives those drafts only as wording to avoid; it retries once if it repeats a draft, then uses a fresh explicitly labelled basic draft if necessary. This bounded history is kept in session storage with an in-memory fallback, scoped to the business and never saved to Supabase. The demo uses explicitly labelled varied basic drafts in the chosen language and does not redirect to a real business. No reviews are submitted or verified automatically. Customer ratings, choices and generated review text are not stored in Supabase.

Reply flow: paste a real Google review into the dashboard, generate three replies, edit and copy a reply, then publish it from the business's Google Business Profile. Original review text and the three initial reply drafts are saved in `review_reply_drafts`. These records remain private to assigned active accounts and admins. Edits made after generation are not automatically saved. There is no Google review synchronization or automated reply posting; those require an authorized Google Business Profile API integration.

### AI provider

The three server functions use the official OpenAI SDK. On eligible credit-based Netlify plans, Netlify AI Gateway injects provider credentials. Otherwise set **OPENAI_API_KEY** in the Netlify project's Functions environment. Never put it in the browser or a tracked file. Optional `REVIEW_AI_MODEL` defaults to `gpt-4.1-mini` (verified in Netlify's provider catalog); configure a supported Chat Completions model with JSON mode.

AI calls consume provider tokens / Netlify AI credits. Requests are limited to six per minute per IP+domain per generation function. Input text is bounded, each generation produces three short drafts, SDK retries are disabled, and the request timeout is 22 seconds. Enable the add-on only for the businesses you want to use this feature.

Without provider credentials, the app clearly labels basic review drafts. It never represents these templates as AI. A configured provider failing returns an actionable error, while the customer can still go directly to Google.

Interactive sample: `/review.html?demo=1`. The sample uses basic suggestions and never targets a real business. Live assistant: `/review.html?code=QR00001` for an active QR whose business has the add-on enabled. Opening that page directly does not add another scan; the `/qr/` resolver records the scan once.

Verification: `npm ci`, `npm test`, `npm run check`. Server functions remain outside `site/`, so server keys and source are not published as static files.


## Restaurant guest theme add-ons

Open a restaurant → **Themes & style**. Four guest menu layouts are available:

- **Daily Menu**: included default, clean photo header and category cards.
- **Garden Cards**: paid theme add-on, sage photo gallery and two-column dish cards.
- **Evening Edition**: paid theme add-on, editorial dining layout.
- **Café Journal**: paid theme add-on, warm café typography and paper-style menu.

Managers can preview any layout without changing the live page, and request a locked design with **Request add-on**. The request appears in **Tickets & services**. Admins use **Enable theme add-on** or **Disable theme add-on** on the restaurant's theme card; enabling access allows the manager to choose **Use design**. No payment is automatically charged.

Access is per restaurant and design. Approval is a completed, RLS-protected restaurant add-on request with a reserved `guest-theme:<id>` service name. Existing request policies and triggers allow only an active administrator to approve or close it; managers and agents can submit only open requests. The public restaurant API checks completed approvals before serving a premium layout. A manually written locked theme ID, a revoked add-on, an unknown theme, or an unavailable approval lookup falls back to Daily Menu. Existing request and venue tables are reused; no new migration is needed.

Menu images, prices, availability, diet labels, allergens, Wi-Fi, loyalty and honest Google review links are retained. Paid previews use the current restaurant's content in a sandboxed frame. Demo-only theme URLs such as `/restaurants/?venue=demo&theme=garden` preview sample layouts; theme query parameters do not override a live restaurant's access.

Restaurant printed cards are separate from guest theme add-ons. Open **QR & table card** for six table-card designs, four patterns, A6 printing and PNG/SVG downloads. The existing restaurant QR destination is preserved. Agents after handover and read-only manager previews can print/export but cannot change card design preferences.

## GitHub verification

`npm run check` and `npm test` cover syntax, permissions, account isolation, permanent handover, commissions, tickets, QR card generation and guest theme access. The **QR design verification** GitHub Actions workflow additionally renders and decodes all 48 printed QR combinations, tests downloads and print sizing, and exercises theme preview → request → admin enable → manager use → admin disable, mobile menu navigation and search. Screenshots are uploaded as the `qr-design-proof` artifact.
