# GA4 Integration

## Measurement ID

The production measurement ID is supplied at build time through
`PUBLIC_GA_MEASUREMENT_ID`. It is a public identifier, not a secret. The GitHub
Actions deployment reads it from the repository variable with the same name.
Use `.env.example` as the local reference; do not commit a real `.env` file.

## Google tag location

`src/layouts/Base.astro` owns the single Google tag installation. Every public
page uses this layout, so the tag must not be copied into individual pages or
post templates.

The external Google script is asynchronous. If it is blocked or fails to load,
the page, navigation, search, images, and existing public counters continue to
work independently.

## Page-view strategy

This site is an Astro static multi-page application (MPA), not a client-side
SPA. Every internal navigation loads a new HTML document. GA4 automatic page
measurement therefore records exactly one `page_view` for each document load,
including refresh, back/forward navigation, direct URLs, category query-string
URLs, and unique post URLs.

There is no manual `page_view` handler. Adding one would duplicate the automatic
event. Page titles come from each page's existing `<title>` metadata.

## Production-only collection

The tag renders only when both conditions are true:

1. Astro is building in production mode (`import.meta.env.PROD`).
2. `PUBLIC_GA_MEASUREMENT_ID` is present and matches the `G-...` format.

The variable is not set by default for local development, so localhost traffic
does not enter the production property. Do not add the production value to a
local `.env` file unless explicitly testing collection.

## Enhanced Measurement

Keep these stream features enabled:

- Page views
- Scrolls
- Outbound clicks
- File downloads

Keep these disabled for the current site:

- Site search: Pagefind search terms are not represented in the URL.
- Video engagement: the profile video is a local HTML video, not an embedded
  YouTube player supported by this measurement.
- Form interactions: the site has no user-submission form.

Do not send names, email addresses, phone numbers, or other user-entered data in
URLs or analytics events.

## Verification

After deployment:

1. Open the production site with tracking protection disabled for the test.
2. In browser Network tools, filter for `gtag/js` and `g/collect`.
3. Confirm one `page_view` per document navigation on Home, category, two posts,
   Search, refresh, back, forward, and a direct post URL.
4. Confirm `dl` contains the current URL and `dt` contains the current page
   title.
5. Check GA4 Realtime or DebugView for the same paths and titles. Realtime
   processing can lag briefly after the network request succeeds.

Public GoatCounter counts are a separate feature and do not initialize or send
GA4 events.
