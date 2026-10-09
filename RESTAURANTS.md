# Restaurant workspace

The Google-review workspace stays separate and uses abstract blue glass surfaces, with no restaurant photographs. Its existing QR inventory, review generation, handoff, payments and business records are unchanged. The sidebar opens **Set up Restaurant** using the same Supabase session key (`qr-field-ops-auth`); signing in once is enough for agents and admins on the same origin. Restaurant-only manager accounts are redirected from the root sign-in to their own dashboard.

## Agent onboarding and manager handover

1. Set up a restaurant name, permanent slug, type, theme and guest connections.
2. Open **Manager & handover** and create a restaurant-only manager login with the manager's email and an initial password of at least 12 characters. Share the password securely outside the app. Existing accounts are never reset by an agent. Managers change the password in **My account**.
3. Add dishes, upload photos and publish the guest page. Show the manager how to edit menus, images, themes, Google review links and Wi-Fi using the built-in guide.
4. Finish handover. Agent editing ends; original setup attribution stays immutable. Admins can restore support or assign another support agent without transferring setup credit.

Managers access only their assigned restaurants, menu settings, feedback and loyalty members. They cannot create restaurants, manage agents or approve commissions. Their field-worker profile is inactive by a database trigger keyed to server-controlled account metadata; venue access is granted through `restaurant_manager_access`, never user metadata.

## Admin oversight

Administrators manage all restaurants, pause/restore public guest pages, disable/restore manager access, assign support agents and edit restaurant content. **Agent performance** paginates all restaurant setups and reports totals, live venues, manager-ready venues and completed handovers per original agent. CSV export includes setup and commission information.

**Restaurant commissions** uses one row per venue. Admins choose amount/currency, approve/reject and subsequently record paid status. Approval requires an active manager and a published, unpaused menu. Paid status requires prior approval. This records decisions and payments; it does not transfer money or modify the original Google-review wallet/commission system. Currency totals are shown separately. Agents can read their own commission records; managers cannot.

## Guest themes and image uploads

Six selectable styles: Glass Bistro (Outfit), Garden Table (Manrope), Spice & Heritage (Cormorant Garamond), Coastal Blue (DM Sans), Midnight Dining (Cormorant Garamond), and Café Cream (Fraunces). Guest pages use the selected style and the global light/dark preference. Changing themes or menus preserves the restaurant's permanent QR URL.

Menu editing includes names, categories, prices, descriptions, dietary labels, allergens, sold-out states, photos and ordering. Logos, cover images and dish photos support direct JPG/PNG/WebP uploads up to 5 MB, as well as HTTPS links. The public `restaurant-images` bucket stores public menu assets in venue-specific paths. Uploads are authorized by venue RLS and use immutable unique filenames, so replacement does not overwrite another restaurant's assets.

Google review links are optional and shown equally to all guests irrespective of private feedback ratings. Loyalty cards use random browser credentials and staff-only atomic stamp/redeem actions. A member QR identifies the card; it never awards stamps itself.

## Deployment and validation

Existing installations apply `supabase/migrations/20261009063719_restaurant_manager_control.sql` after `restaurant_setup.sql`. The migration is additive and updates only restaurant access policies plus the new-identity profile guard. Supabase storage remains public for menu images, with venue ownership enforced on uploads. Netlify `restaurant-manage.mjs` verifies the bearer token with Supabase and checks database-backed administrator/agent/manager access before privileged operations. Service credentials remain server-only.

Run `npm test` and `npm run check`. Tests exercise manager isolation, disabled accounts, immutable credit, handover, commission eligibility and approval sequencing, storage ownership and endpoint authorization, alongside existing Google-review tests.

Labelled demo routes `?agent-demo=1`, `?admin-demo=1`, `?manager-demo=1` store demo edits in this browser only. Guest `?venue=demo&preview=<demo-id>` previews those edits without altering live records. Real venues use `?venue=<slug>` and must be published and not paused.

## Limits

Browser loyalty stays on the original device. Guest/member analytics list recent bounded records, while setup attribution counts paginate all venues. This app does not collect orders or payments, supply native wallet passes, scan menus with AI, or send marketing messages. Manager email/password creation does not send email; agents share credentials securely and managers update their initial password after onboarding.

## Manager administration and recovery

- Admins can edit manager names and login emails from Manager & handover. To replace a person, disable access and create a separate manager account. Assignment is verified by the server before any account change.
- Reset password creates a Supabase recovery token for the currently assigned, active manager. The private link must be shared securely by the admin; no email is sent automatically and no password is returned.
- The recovery token stays in the URL fragment and is removed before API calls. Recovery uses an isolated, non-persistent session, so opening a manager link cannot overwrite an administrator’s normal QR login. New passwords require 12–128 characters, matching confirmation, and global refresh-session sign-out after success.
- View manager dashboard opens an authenticated read-only view of the selected restaurant using the existing admin session. It does not impersonate the manager. The public manager demo is separately labelled and never writes live data.
- Guest glass cards include soft arrival and ambient drift animations across all six themes. Reduced-motion preferences disable animations; browsers without backdrop-filter use opaque readable surfaces.
