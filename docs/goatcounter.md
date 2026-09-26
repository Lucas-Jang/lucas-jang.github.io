# GoatCounter Integration

## Collection

`public/scripts/site-stats.js` sends the current `pathname + search` to the
GoatCounter `/count` endpoint for per-page visit counts.

GoatCounter's session handling deduplicates repeat visits to the same path for
eight hours. Site-wide and daily figures are read from GoatCounter's special
public `TOTAL` counter, avoiding a second synthetic pageview for every real
pageview.

The collector is hosted with the blog instead of loading `gc.zgo.at/count.js`.
This removes a commonly blocked third-party script dependency. The actual count
request still goes directly to the configured GoatCounter site.

Likely automated browsers, framed pages, and browsers that have opted out with
`localStorage.skipgc = 't'` are not sent.

## Displayed counts

Public counts are read from `/counter/{encoded-path}.json`. GoatCounter may
cache these responses for up to four hours. A missing path returns HTTP 404;
the post view counter then falls back to GoatCounter's official, unbranded HTML
counter instead of displaying the misleading value `0`.

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
