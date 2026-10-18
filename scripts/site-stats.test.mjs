import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseCount, readCounter, refreshSnapshot } from './fetch-goatcounter-stats.mjs';

const source = await readFile(new URL('../public/scripts/site-stats.js', import.meta.url), 'utf8');
const now = new Date('2026-10-17T11:00:00Z');
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const snapshot = {
  generatedAt: now.toISOString(), total: 280, totalUpdatedAt: now.toISOString(),
  today: { date: '2026-10-17', timeZone: 'UTC', count: 37, updatedAt: now.toISOString() },
  pageviews: { '/posts/example': 4 },
};

function browser(options = {}) {
  let time = Date.parse(options.time ?? now);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const spans = Object.fromEntries(['visitors', 'today', 'pageviews'].map((name) => [name,
    Array.from({ length: 2 }, () => ({ textContent: '—', title: '' })),
  ]));
  const requests = [], beacons = [], pixels = [], timers = [];
  const documentEvents = {}, windowEvents = {};
  const document = {
    readyState: 'complete', visibilityState: options.hidden ? 'hidden' : 'visible',
    title: 'Example', referrer: '',
    querySelector: () => options.post ? { dataset: { path: '/posts/example/' } } : null,
    querySelectorAll: (selector) => spans[selector.match(/data-stat="([^"]+)"/)[1]],
    addEventListener: (name, callback) => { documentEvents[name] = callback; },
    body: { appendChild: (pixel) => pixels.push(pixel) },
  };
  const window = {
    screen: { width: 390 },
    addEventListener: (name, callback) => { windowEvents[name] = callback; },
  };
  window.self = window; window.top = options.frame ? {} : window;
  const location = {
    hostname: options.local ? 'localhost' : 'lucas-jang.github.io', protocol: 'https:',
    pathname: options.post ? '/posts/example/' : '/', search: options.search ?? '',
  };
  class Pixel {
    constructor() { this.style = {}; this.events = {}; }
    setAttribute() {}
    addEventListener(name, callback) { this.events[name] = callback; }
    remove() { this.removed = true; }
  }
  const navigator = {
    webdriver: options.bot ?? false,
    sendBeacon: (url) => {
      beacons.push(String(url));
      if (options.beaconThrows) throw new Error('Policy');
      return options.beacon !== false;
    },
  };
  if (options.noBeacon) delete navigator.sendBeacon;
  vm.runInNewContext(source, {
    window, document, location, navigator, Image: Pixel, Date: Clock, Intl, URL, URLSearchParams,
    AbortSignal: options.oldBrowser ? undefined : AbortSignal,
    localStorage: { getItem: () => {
      if (options.storageThrows) throw new Error('Privacy mode');
      return options.optOut ? 't' : null;
    } },
    setInterval: (fn) => timers.push(fn),
    fetch: async (url, config) => {
      requests.push({ url: String(url), config });
      if (options.fetch) return options.fetch(url, config);
      if (String(url).startsWith('/data/')) return json(options.snapshot ?? snapshot);
      const u = new URL(url);
      return json({ count: u.pathname.includes('TOTAL') ? u.searchParams.has('start') ? '38' : '281' : '5' });
    },
  });
  return {
    spans, requests, beacons, pixels, timers, document, documentEvents, windowEvents,
    advance: (newTime) => { time = Date.parse(newTime); },
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };

test('today queries the UTC day with an open end, including at the Korean date boundary', async () => {
  for (const time of ['2026-10-16T23:59:59Z', '2026-10-17T00:00:00Z', '2026-12-31T23:59:59Z']) {
    const app = browser({ time }); await settle();
    const request = app.requests.map(({ url }) => new URL(url, 'https://example.com')).find((u) => u.searchParams.has('start'));
    assert.equal(request.searchParams.get('start'), time.slice(0, 10));
    assert.equal(request.searchParams.has('end'), false);
  }
});

test('updates both menu/footer copies and live post count; the saved fallback cannot overwrite live counts', async () => {
  const app = browser({ post: true }); await settle();
  for (const [name, value] of [['visitors', '281'], ['today', '38'], ['pageviews', '5']]) {
    assert.deepEqual(app.spans[name].map((e) => e.textContent), [value, value]);
  }
  assert.equal(new URL(app.beacons[0]).searchParams.get('p'), '/posts/example');
});

test('a late smaller snapshot does not overwrite a counter that has already finished', async () => {
  let resolve;
  const delayed = new Promise((r) => { resolve = r; });
  const app = browser({ fetch: (url) => String(url).startsWith('/data/') ? delayed : json({ count: '99' }) });
  await settle(); resolve(json({ ...snapshot, total: 98 })); await settle();
  assert.equal(app.spans.visitors[0].textContent, '99');
  assert.equal(app.spans.today[0].textContent, '99');
});

test('blocked third-party counters use same-origin saved counts without technical tooltips', async () => {
  const app = browser({ post: true, fetch: (url) => {
    if (String(url).startsWith('/data/')) return json(snapshot);
    throw new Error('blocked');
  } }); await settle();
  assert.equal(app.spans.visitors[0].textContent, '280');
  assert.equal(app.spans.today[0].textContent, '37');
  assert.equal(app.spans.pageviews[0].textContent, '4');
  assert.equal(app.spans.today[0].title, '');
});

test('yesterday snapshot is never displayed as today and failures never fabricate zero', async () => {
  const app = browser({ time: '2026-10-18T00:00:00Z', fetch: (url) => String(url).startsWith('/data/') ? json(snapshot) : json({}, 503) });
  await settle();
  assert.equal(app.spans.today[0].textContent, '—');
  assert.equal(app.spans.visitors[0].textContent, '280');
});

test('UTC midnight clears yesterday, refreshes visible counters, and does not recount the page', async () => {
  const app = browser(); await settle();
  app.advance('2026-10-18T00:00:01Z'); app.timers[0](); await settle();
  assert.equal(app.beacons.length, 1);
  assert(app.requests.some(({ url }) => url.includes('start=2026-10-18')));
});

test('requests started before UTC midnight cannot restore yesterday after the date changes', async () => {
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const app = browser({ time: '2026-10-17T23:59:59Z', fetch: () => pending });
  app.advance('2026-10-18T00:00:01Z');
  resolve(json({ ...snapshot, count: '38' })); await settle();
  assert.equal(app.spans.today[0].textContent, '—');
});

test('hidden pages wait for visibility; repeated visibility and restored pages do not recount', async () => {
  const app = browser({ hidden: true }); await settle();
  assert.equal(app.beacons.length, 0);
  assert.equal(app.requests.length, 0);
  app.document.visibilityState = 'visible';
  app.documentEvents.visibilitychange(); app.windowEvents.pageshow(); await settle();
  assert.equal(app.beacons.length, 1);
  assert.equal(app.requests.length, 3);
});

test('bot, local, framed and opted-out views never send a hit but can still read counters', async () => {
  for (const option of ['bot', 'local', 'frame', 'optOut']) {
    const app = browser({ [option]: true }); await settle();
    assert.equal(app.beacons.length, 0, option);
    assert.equal(app.pixels.length, 0, option);
    assert.equal(app.spans.visitors[0].textContent, '281');
  }
});

test('false or throwing beacon falls back to an attached pixel and does not interrupt rendering', async () => {
  for (const config of [{ beacon: false }, { beaconThrows: true }]) {
    const app = browser(config); await settle();
    assert.equal(app.pixels.length, 1);
    assert.equal(new URL(app.pixels[0].src).pathname, '/count');
    assert.equal(app.spans.today[0].textContent, '38');
    app.pixels[0].events.load(); assert.equal(app.pixels[0].removed, true);
  }
});

test('read counters on browsers without AbortSignal.timeout', async () => {
  const app = browser({ oldBrowser: true }); await settle();
  assert.equal(app.spans.today[0].textContent, '38');
});

test('keeps category visits while dropping cache/debug/tracking parameters and normalizing post slashes', async () => {
  for (const [search, expected] of [['?category=DEV&utm_source=mail', '/?category=DEV'], ['?deployment=abc', '/'], ['?category=ALL', '/']]) {
    const app = browser({ search }); await settle();
    assert.equal(new URL(app.beacons[0]).searchParams.get('p'), expected);
  }
});

test('count parsing accepts real localized integer counts, never shorthand, negative or malformed values', async () => {
  for (const [value, expected] of [[0, 0], ['1,234', 1234], ['1.234', 1234], ['1\u202f234', 1234], [null, null], ['-1', null], ['1.2k', null], ['12oops', null], ['1.2', null], [Number.MAX_SAFE_INTEGER + 1, null]]) {
    assert.equal(parseCount(value), expected, String(value));
    const app = browser({ snapshot: {}, fetch: () => json({ count: value }) }); await settle();
    assert.equal(app.spans.today[0].textContent, expected === null ? '—' : new Intl.NumberFormat('ko-KR').format(expected));
  }
});

test('JSON endpoint handles legitimate unseen-page zero and rejects error/HTML/timeout responses', async () => {
  assert.equal(await readCounter('/unseen', {}, async () => json({ count: '0' }, 404)), 0);
  assert.equal(await readCounter('/broken', {}, async () => json({}, 403)), null);
  assert.equal(await readCounter('/broken', {}, async () => { throw new Error('timeout'); }), null);
  assert.equal(await readCounter('/broken', {}, async () => ({ ok: true, json: async () => { throw new Error('html'); } })), null);
});

test('snapshot refresh preserves previous good counts and actual checked dates on partial failure', async () => {
  const old = { ...snapshot, pageviews: { '/one': 12, '/two': 2, '/removed': 3 } };
  const { snapshot: result, failures } = await refreshSnapshot(['/one', '/two', '/new'], old, {
    now: new Date('2026-10-17T12:00:00Z'), read: async (path, params) => {
      if (path === '/two') return 3;
      if (path === '/new') return 0;
      if (params.start) throw new Error('timeout');
      return null;
    },
  });
  assert.equal(failures, 3);
  assert.equal(result.total, 280);
  assert.equal(result.today.count, 37);
  assert.equal(result.totalUpdatedAt, old.totalUpdatedAt);
  assert.equal(result.today.updatedAt, old.today.updatedAt);
  assert.deepEqual(result.pageviews, { '/one': 12, '/two': 3, '/new': 0 });
  assert.equal(result.pageviewsUpdatedAt['/one'], old.generatedAt);
});

test('snapshot never carries yesterday into today and bounds public counter concurrency to four', async () => {
  let active = 0, peak = 0;
  const { snapshot: result } = await refreshSnapshot(Array.from({ length: 20 }, (_, i) => `/p${i}`), snapshot, {
    now: new Date('2026-10-18T00:00:01Z'), read: async () => {
      peak = Math.max(peak, ++active); await new Promise(setImmediate); active--; return null;
    },
  });
  assert.equal(result.today, undefined);
  assert.equal(result.total, 280);
  assert(peak <= 4);
});

test('an older live cache must not roll larger saved counts backwards, in either completion order', async () => {
  for (const snapshotFirst of [true, false]) {
    let resolve;
    const pending = new Promise((r) => { resolve = r; });
    const older = { count: '1' };
    const app = browser({ post: true, fetch: (url) => {
      const saved = String(url).startsWith('/data/');
      return saved === snapshotFirst ? json(saved ? snapshot : older) : pending.then(() => json(saved ? snapshot : older));
    } });
    await settle(); resolve(); await settle();
    for (const [name, value] of [['visitors', '280'], ['today', '37'], ['pageviews', '4']]) assert.equal(app.spans[name][0].textContent, value);
  }
});

test('a five-minute refresh preserves larger observed counts when both upstream caches regress', async () => {
  let refresh = false;
  const app = browser({ post: true, fetch: (url) => String(url).startsWith('/data/')
    ? json(refresh ? { ...snapshot, total: 1, today: { ...snapshot.today, count: 0 }, pageviews: { '/posts/example': 0 } } : snapshot)
    : json({ count: refresh ? '0' : new URL(url).searchParams.has('start') ? '38' : '281' }) });
  await settle(); refresh = true;
  app.advance('2026-10-17T11:06:00Z'); app.timers[0](); await settle();
  assert.equal(app.spans.visitors[0].textContent, '281');
  assert.equal(app.spans.today[0].textContent, '38');
});

test('today and a post must never visibly exceed the cumulative counter; no fabricated total is used', async () => {
  const app = browser({ post: true, snapshot: {}, fetch: (url) => String(url).startsWith('/data/')
    ? json({}) : json({ count: new URL(url).pathname.includes('TOTAL') && !new URL(url).searchParams.has('start') ? '3' : '4' }) });
  await settle();
  assert.equal(app.spans.visitors[0].textContent, '3');
  assert.equal(app.spans.today[0].textContent, '—');
  assert.equal(app.spans.pageviews[0].textContent, '—');
});

test('UTC rollover clears the daily high-water mark so a genuine new-day zero is accepted', async () => {
  let nextDay = false;
  const app = browser({ fetch: (url) => String(url).startsWith('/data/') ? json(snapshot)
    : json({ count: new URL(url).searchParams.has('start') ? nextDay ? '0' : '38' : '281' }) });
  await settle(); nextDay = true;
  app.advance('2026-10-18T00:00:01Z'); app.timers[0](); await settle();
  assert.equal(app.spans.today[0].textContent, '0');
  assert.equal(app.spans.visitors[0].textContent, '281');
});

test('temporarily conflicting counters reappear when the cumulative cache catches up', async () => {
  let refreshed = false;
  const app = browser({ post: true, fetch: (url) => String(url).startsWith('/data/') ? json({})
    : json({ count: new URL(url).pathname.includes('TOTAL') && !new URL(url).searchParams.has('start') ? refreshed ? '5' : '3' : '4' }) });
  await settle(); assert.equal(app.spans.today[0].textContent, '—');
  assert.equal(app.spans.today[0].title, '방문 통계 확인 중');
  refreshed = true;
  app.advance('2026-10-17T11:06:00Z'); app.timers[0](); await settle();
  assert.equal(app.spans.today[0].textContent, '4');
  assert.equal(app.spans.pageviews[0].textContent, '4');
});

test('build snapshots also omit contradictions instead of publishing a fabricated total', async () => {
  const { snapshot: result, failures } = await refreshSnapshot(['/p'], {}, {
    now, read: async (path, params) => path === 'TOTAL' && !params.start ? 3 : 4,
  });
  assert.equal(result.total, 3);
  assert.equal(result.today, undefined);
  assert.deepEqual(result.pageviews, {});
  assert.equal(failures, 2);
});

test('private storage restrictions do not lose visits, and missing beacon support still sends a pixel', async () => {
  const privateApp = browser({ storageThrows: true }); await settle();
  assert.equal(privateApp.beacons.length, 1);
  assert.equal(privateApp.spans.today[0].textContent, '38');
  const legacyApp = browser({ noBeacon: true }); await settle();
  assert.equal(legacyApp.pixels.length, 1);
  assert.equal(legacyApp.spans.today[0].textContent, '38');
});

test('reordered independent caches always converge to observed counts without showing today above total', async () => {
  // All six completion orders for the snapshot, total and daily counter.
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const resolvers = [];
    const app = browser({ fetch: (url) => new Promise((resolve) => {
      const index = String(url).startsWith('/data/') ? 0 : new URL(url).searchParams.has('start') ? 2 : 1;
      resolvers[index] = resolve;
    }) });
    for (const index of order) {
      resolvers[index](json(index === 0 ? snapshot : { count: index === 1 ? '281' : '38' }));
      await settle();
      const total = app.spans.visitors[0].textContent;
      const today = app.spans.today[0].textContent;
      if (total !== '—' && today !== '—') assert(Number(total) >= Number(today));
    }
    assert.equal(app.spans.visitors[0].textContent, '281');
    assert.equal(app.spans.today[0].textContent, '38');
  }
});
