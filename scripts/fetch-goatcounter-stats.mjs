import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const counterOrigin = 'https://lucasjang.goatcounter.com';

export function parseCount(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:[.,\s]\d{3})+)$/.test(text)) return null;
  const count = Number(text.replace(/[.,\s]/g, ''));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export async function readCounter(path, params = {}, fetcher = fetch) {
  const url = new URL(`${counterOrigin}/counter/${encodeURIComponent(path)}.json`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'lucas-jang-blog-stats/2.0' },
    });
    if (!response.ok && response.status !== 404) return null;
    return parseCount((await response.json()).count);
  } catch {
    return null;
  }
}

export async function refreshSnapshot(paths, previous = {}, { now = new Date(), read = readCounter } = {}) {
  const generatedAt = now.toISOString();
  const date = generatedAt.slice(0, 10);
  const snapshot = { generatedAt, pageviews: {}, pageviewsUpdatedAt: {} };
  const updates = [
    { path: 'TOTAL', params: {}, key: 'total' },
    { path: 'TOTAL', params: { start: date }, key: 'today' },
    ...paths.map((path) => ({ path, params: {}, key: 'page' })),
  ];
  // Bound concurrency: public counters can be slow or unavailable during a build.
  let cursor = 0;
  let failures = 0;
  await Promise.all(Array.from({ length: Math.min(4, updates.length) }, async () => {
    while (cursor < updates.length) {
      const { path, params, key } = updates[cursor++];
      let count = null;
      try { count = parseCount(await read(path, params)); } catch { /* retain last valid result */ }
      const fresh = count !== null;
      if (!fresh) failures++;
      if (key === 'total') {
        count ??= parseCount(previous.total);
        if (count !== null) {
          snapshot.total = count;
          snapshot.totalUpdatedAt = fresh ? generatedAt : previous.totalUpdatedAt ?? previous.generatedAt;
        }
      } else if (key === 'today') {
        if (!fresh && previous.today?.date === date && previous.today.timeZone === 'UTC') count = parseCount(previous.today.count);
        if (count !== null) snapshot.today = {
          date, timeZone: 'UTC', count,
          updatedAt: fresh ? generatedAt : previous.today.updatedAt ?? previous.generatedAt,
        };
      } else {
        count ??= parseCount(previous.pageviews?.[path]);
        if (count !== null) {
          snapshot.pageviews[path] = count;
          snapshot.pageviewsUpdatedAt[path] = fresh
            ? generatedAt : previous.pageviewsUpdatedAt?.[path] ?? previous.generatedAt;
        }
      }
    }
  }));
  if (snapshot.total !== undefined) {
    // Independent upstream caches can temporarily disagree. Preserve the known
    // cumulative count; omit conflicting components instead of manufacturing a sum.
    if (snapshot.today?.count > snapshot.total) {
      delete snapshot.today;
      failures++;
    }
    for (const [path, count] of Object.entries(snapshot.pageviews)) {
      if (count <= snapshot.total) continue;
      delete snapshot.pageviews[path];
      delete snapshot.pageviewsUpdatedAt[path];
      failures++;
    }
  }
  return { snapshot, failures };
}

async function main() {
  const postsDirectory = new URL('../src/content/posts/', import.meta.url);
  const outputDirectory = new URL('../public/data/', import.meta.url);
  const outputFile = new URL('./goatcounter.json', outputDirectory);
  const files = (await readdir(postsDirectory)).filter((file) => ['.md', '.mdx'].includes(extname(file)));
  const paths = files.map((file) => `/posts/${basename(file, extname(file))}`);
  // Scheduled builds start from a checkout; updated statistics live in deployment artifacts.
  let previous = {};
  try { previous = JSON.parse(await readFile(outputFile, 'utf8')); } catch { /* first build */ }
  try {
    const response = await fetch('https://lucas-jang.github.io/data/goatcounter.json', { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const deployed = await response.json();
      if (Date.parse(deployed.generatedAt) > (Date.parse(previous.generatedAt) || 0)) previous = deployed;
    }
  } catch { /* the checkout snapshot remains available */ }
  const { snapshot, failures } = await refreshSnapshot(paths, previous);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${Object.keys(snapshot.pageviews).length} page counts, total=${snapshot.total ?? 'unavailable'}, today (UTC)=${snapshot.today?.count ?? 'unavailable'}; ${failures} requests used fallback or remained unavailable.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
