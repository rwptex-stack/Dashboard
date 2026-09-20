// Fetches Dorothy's 12 RSS feeds server-side (no CORS issue here, no
// third-party proxy needed) and writes the results to briefing-dorothy.json.
// If a feed fails this run, the previous good data for that item is kept
// (marked ok:false) rather than wiped, per the "always show something" rule.
import Parser from 'rss-parser';
import fs from 'fs';

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DorothyDashboardBot/1.0)' } });

const FEEDS = [
  ['Fox News', 'https://feeds.foxnews.com/foxnews/latest', 6],
  ['Real Clear Politics', 'https://www.realclearpolitics.com/index.xml', 6],
  ['The Hill', 'https://thehill.com/rss/syndicator/19110', 5],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 5],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', 5],
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 7],
  ['BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 6],
  ['NY Times', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', 5],
  ['ARTNews', 'https://www.artnews.com/feed/', 6],
  ['Hyperallergic', 'https://hyperallergic.com/feed/', 6],
  ['Contemporary Art Daily', 'https://www.contemporaryartdaily.com/feed/', 6],
  ['Booooooom', 'https://www.booooooom.com/feed/', 6],
];

const OUT_FILE = 'briefing-dorothy.json';

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

async function main() {
  const feeds = {};
  for (const [name, url, n] of FEEDS) {
    feeds[name] = await fetchFeed(name, url, n);
  }

  const out = { fetchedAt: nowIso(), feeds };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  const failedFeeds = Object.entries(feeds).filter(([, v]) => !v.ok).map(([k]) => k);
  console.log('Wrote', OUT_FILE + '.', failedFeeds.length ? 'Failed feeds: ' + failedFeeds.join(', ') : 'All feeds OK.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
