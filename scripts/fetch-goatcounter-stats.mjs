import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const counterOrigin = 'https://lucasjang.goatcounter.com';
const postsDirectory = new URL('../src/content/posts/', import.meta.url);
const outputDirectory = new URL('../public/data/', import.meta.url);
const outputFile = new URL('./goatcounter.json', outputDirectory);

const files = (await readdir(postsDirectory)).filter((file) => ['.md', '.mdx'].includes(extname(file)));
const paths = files.map((file) => `/posts/${basename(file, extname(file))}`);

const readCount = async (path) => {
  const url = `${counterOrigin}/counter/${encodeURIComponent(path)}.html?no_branding=1`;
  const response = await fetch(url, { headers: { 'user-agent': 'lucas-jang-blog-stats/1.0' } });
  if (!response.ok) return null;

  const html = await response.text();
  const value = html.match(/id="gcvc-views">\s*([^<]+)</)?.[1] ?? '';
  const count = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(count) ? count : null;
};

const entries = await Promise.all(paths.map(async (path) => [path, await readCount(path)]));
const pageviews = Object.fromEntries(entries.filter(([, count]) => count !== null));
const payload = `${JSON.stringify({ generatedAt: new Date().toISOString(), pageviews }, null, 2)}\n`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, payload, 'utf8');
console.log(`Wrote ${Object.keys(pageviews).length} GoatCounter page counts to ${join('public', 'data', 'goatcounter.json')}`);
