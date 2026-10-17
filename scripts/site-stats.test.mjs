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
  vm.runInNewContext(source, {
    window, document, location, navigator, Image: Pixel, Date: Clock, Intl, URL, URLSearchParams,
    AbortSignal: options.oldBrowser ? undefined : AbortSignal,
    localStorage: { getItem: () => options.optOut ? 't' : null },
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

test('a late snapshot does not overwrite a counter that has already finished', async () => {
  let resolve;
  const delayed = new Promise((r) => { resolve = r; });
  const app = browser({ fetch: (url) => String(url).startsWith('/data/') ? delayed : json({ count: '99' }) });
  await settle(); resolve(json(snapshot)); await settle();
  assert.equal(app.spans.visitors[0].textContent, '99');
  assert.equal(app.spans.today[0].textContent, '99');
});

test('blocked third-party counters use same-origin saved counts and expose their saved timestamp', async () => {
  const app = browser({ post: true, fetch: (url) => {
    if (String(url).startsWith('/data/')) return json(snapshot);
    throw new Error('blocked');
  } }); await settle();
  assert.equal(app.spans.visitors[0].textContent, '280');
  assert.equal(app.spans.today[0].textContent, '37');
  assert.equal(app.spans.pageviews[0].textContent, '4');
  assert.match(app.spans.today[0].title, /저장된 집계/);
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
