# GoatCounter Integration

## Collection

`public/scripts/site-stats.js` sends two first-party page requests to the
GoatCounter `/count` endpoint:

- The current `pathname + search` for per-page visit counts.
- `/visitors` for a site-wide visitor count.

GoatCounter's session handling deduplicates repeat visits to the same path for
eight hours. The `/visitors` path therefore acts as an approximate unique
visitor count for that session window, while each post path tracks visits to
that post.

The collector is hosted with the blog instead of loading `gc.zgo.at/count.js`.
This removes a commonly blocked third-party script dependency. The actual count
request still goes directly to the configured GoatCounter site.

Likely automated browsers, framed pages, and browsers that have opted out with
`localStorage.skipgc = 't'` are not sent.

## Displayed counts

Public counts are read from `/counter/{encoded-path}.json`. GoatCounter may
cache these responses for up to four hours. A missing path returns HTTP 404;
that state is displayed as an em dash rather than the misleading value `0`.

Collection and display are intentionally independent. A blocked or unavailable
analytics request never blocks the page, navigation, or search.

## Verification

1. Visit a production page in a normal, visible browser without an ad blocker.
2. Confirm a request to `https://lucasjang.goatcounter.com/count` is sent with
   the page path in the `p` query parameter.
3. Check the GoatCounter dashboard after about ten seconds.
4. Allow up to four hours before expecting the public counter JSON and the
   number displayed on the blog to refresh.
5. Repeated visits from the same session do not increment the same path again.
