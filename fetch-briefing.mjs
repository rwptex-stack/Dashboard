// Fetches Ron's 9 RSS feeds + 6 market symbols server-side (no CORS issue here,
// no third-party proxy needed) and writes the results to briefing-ron.json.
// If a feed or market fetch fails this run, the previous good data for that
// item is kept (marked ok:false) rather than wiped, per the "always show
// something" rule from earlier project history.
import Parser from 'rss-parser';
import fs from 'fs';

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RonDashboardBot/1.0)' } });

const FEEDS = [
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 6],
  ['Fox News', 'https://feeds.foxnews.com/foxnews/latest', 6],
  ['Real Clear Politics', 'https://www.realclearpolitics.com/index.xml', 6],
  ['The Hill', 'https://thehill.com/rss/syndicator/19110', 5],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 5],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', 5],
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 7],
  ['BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 6],
  ['NY Times', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 5],
];

const SYMS = [
  ['^GSPC', 'S&P 500'], ['^DJI', 'Dow Jones'], ['^IXIC', 'Nasdaq'],
  ['GC=F', 'Gold'], ['BTC-USD', 'Bitcoin'], ['SPCX', 'SpaceX'],
];

const OUT_FILE = 'briefing-ron.json';

let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch (e) { /* first run, no previous file */ }

const nowIso = () => new Date().toISOString();

async function fetchFeed(name, url, n) {
  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || [])
      .slice(0, n)
      .map(i => ({ title: (i.title || '').trim(), link: i.link || '' }))
      .filter(i => i.title && i.title.length > 5);
    if (!items.length) throw new Error('empty feed');
    return { items, ok: true, updatedAt: nowIso() };
  } catch (e) {
    const old = prev.feeds && prev.feeds[name];
    return old ? { ...old, ok: false } : { items: [], ok: false, updatedAt: null };
  }
}

async function fetchIndex(sym, name) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=5d';
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RonDashboardBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('status ' + r.status);
  const d = await r.json();
  const meta = d?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice, prevClose = meta?.chartPreviousClose;
  if (!isFinite(price) || !isFinite(prevClose) || prevClose === 0) throw new Error('bad data');
  return { name, price, pct: (price - prevClose) / prevClose * 100 };
}

async function main() {
  const feeds = {};
  for (const [name, url, n] of FEEDS) {
    feeds[name] = await fetchFeed(name, url, n);
  }

  let indices;
  try {
    const results = await Promise.all(SYMS.map(([sym, name]) => fetchIndex(sym, name).catch(() => null)));
    const fresh = results.filter(Boolean);
    if (!fresh.length) throw new Error('all symbols failed');
    indices = { data: fresh, ok: true, updatedAt: nowIso() };
  } catch (e) {
    indices = prev.indices ? { ...prev.indices, ok: false } : { data: [], ok: false, updatedAt: null };
  }

  const out = { fetchedAt: nowIso(), feeds, indices };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  const failedFeeds = Object.entries(feeds).filter(([, v]) => !v.ok).map(([k]) => k);
  console.log('Wrote', OUT_FILE + '.', failedFeeds.length ? 'Failed feeds: ' + failedFeeds.join(', ') : 'All feeds OK.', 'Indices ok:', indices.ok);
}

main().catch(e => { console.error(e); process.exit(1); });
