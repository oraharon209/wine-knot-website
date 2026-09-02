#!/usr/bin/env node
/**
 * Local preview server: static frontend/public + mock API from wines_data.json.
 *
 * Usage:
 *   node scripts/preview-server.js                  # redesign on :8090
 *   PORT=8080 ROOT=... BANNER='…' node scripts/preview-server.js
 *
 * Env:
 *   PORT   — listen port (default 8090)
 *   ROOT   — static root (default <repo>/frontend/public)
 *   DATA   — path to wines_data.json (default <repo>/wines_data.json)
 *   BANNER — optional HTML-escaped preview ribbon text (empty = no ribbon)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ROOT = path.resolve(process.env.ROOT || path.join(REPO, 'frontend/public'));
const DATA_PATH = path.resolve(process.env.DATA || path.join(REPO, 'wines_data.json'));
const PORT = Number(process.env.PORT || 8090);
const BANNER = process.env.BANNER || '';

const DATA = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const categories = DATA.categories.map((c, i) => ({ id: i + 1, ...c, sort_order: i + 1 }));
const wines = DATA.wines.map((w) => ({ ...w, out_of_stock: w.out_of_stock ? 1 : 0 }));
const recommendedIds = [89, 90, 32, 55, 38, 46];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const SORT = {
  price_asc: (a, b) => a.sale_price - b.sale_price,
  price_desc: (a, b) => b.sale_price - a.sale_price,
  rating_desc: (a, b) => b.rating - a.rating,
  name_asc: (a, b) => String(a.name).localeCompare(String(b.name), 'he'),
};

function listWines(q) {
  let rows = wines.slice();
  if (q.get('include_oos') !== '1') rows = rows.filter((w) => !w.out_of_stock);
  const category = q.get('category');
  if (category) rows = rows.filter((w) => w.category === category);
  const winery = q.get('winery');
  if (winery) rows = rows.filter((w) => w.winery === winery);
  const search = (q.get('search') || '').trim().slice(0, 64).toLowerCase();
  if (search) {
    rows = rows.filter((w) =>
      [w.name, w.winery, w.notes, w.country, w.grape].some((v) => String(v || '').toLowerCase().includes(search))
    );
  }
  const min = parseFloat(q.get('min_price'));
  if (!Number.isNaN(min)) rows = rows.filter((w) => w.sale_price >= min);
  const max = parseFloat(q.get('max_price'));
  if (!Number.isNaN(max)) rows = rows.filter((w) => w.sale_price <= max);
  const mr = parseFloat(q.get('min_rating'));
  if (!Number.isNaN(mr)) rows = rows.filter((w) => w.rating >= mr);
  rows.sort(SORT[q.get('sort')] || SORT.price_asc);
  const limit = parseInt(q.get('limit') || '0', 10);
  const offset = parseInt(q.get('offset') || '0', 10);
  if (limit > 0) return { wines: rows.slice(offset, offset + limit), total: rows.length };
  return rows;
}

function bannerHtml() {
  if (!BANNER) return '';
  const text = String(BANNER)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return (
    `<div id="wk-preview-banner" style="position:sticky;top:0;z-index:9999;background:#3f1023;color:#fbf7f3;` +
    `font:600 13px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center;direction:ltr">` +
    `${text}</div>`
  );
}

function injectBanner(html) {
  const ribbon = bannerHtml();
  if (!ribbon) return html;
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${ribbon}`);
  return ribbon + html;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === '/api/health') return json(res, 200, { status: 'ok', port: PORT, root: ROOT });
    if (p === '/api/categories') {
      return json(
        res,
        200,
        categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          name_he: c.name_he,
          wine_count: wines.filter((w) => w.category === c.slug).length,
        }))
      );
    }
    if (p === '/api/wines') return json(res, 200, listWines(url.searchParams));
    if (p === '/api/wines/recommended') {
      return json(
        res,
        200,
        recommendedIds.map((id) => wines.find((w) => w.id === id)).filter((w) => w && !w.out_of_stock)
      );
    }
    const m = p.match(/^\/api\/wines\/(\d+)$/);
    if (m) {
      const w = wines.find((x) => x.id === Number(m[1]));
      return w ? json(res, 200, w) : json(res, 404, { error: 'יין לא נמצא' });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    let file = path.join(ROOT, decodeURIComponent(p));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      if (path.extname(p)) {
        res.writeHead(404);
        return res.end('not found');
      }
      file = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };

    if (ext === '.html' && BANNER) {
      let html = fs.readFileSync(file, 'utf8');
      html = injectBanner(html);
      res.writeHead(200, headers);
      return res.end(html);
    }

    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`Wine Knot preview http://localhost:${PORT}`);
    console.log(`  ROOT=${ROOT}`);
    if (BANNER) console.log(`  BANNER=${BANNER}`);
  });
