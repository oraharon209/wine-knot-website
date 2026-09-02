#!/usr/bin/env node
/**
 * Local preview server: static frontend/public + mock public/admin API from wines_data.json.
 *
 * Usage:
 *   PORT=8090 BANNER='NEW redesign' node scripts/preview-server.js
 *
 * Env: PORT (default 8090), ROOT, DATA, BANNER
 *
 * Admin routes are in-memory only (not persisted) so /admin.html works without Docker/MySQL.
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
const catById = new Map(categories.map((c) => [c.id, c]));
const catBySlug = new Map(categories.map((c) => [c.slug, c]));

let nextId = 1;
const wines = DATA.wines.map((w) => {
  const cat = catBySlug.get(w.category) || categories[0];
  nextId = Math.max(nextId, (w.id || 0) + 1);
  return {
    ...w,
    category_id: cat.id,
    category: cat.slug,
    category_he: cat.name_he,
    out_of_stock: w.out_of_stock ? 1 : 0,
  };
});
let recommendedIds = [89, 90, 32, 55, 38, 46].filter((id) => wines.some((w) => w.id === id));

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
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

function enrich(w) {
  const cat = catById.get(w.category_id) || catBySlug.get(w.category) || categories[0];
  return {
    ...w,
    category_id: cat.id,
    category: cat.slug,
    category_he: cat.name_he,
    out_of_stock: w.out_of_stock ? 1 : 0,
  };
}

function recommendedRows() {
  return recommendedIds
    .map((id, i) => {
      const w = wines.find((x) => x.id === id);
      return w ? { ...enrich(w), sort_order: i + 1 } : null;
    })
    .filter(Boolean);
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

async function handleAdmin(req, res, url) {
  const p = url.pathname;
  const method = req.method || 'GET';

  if (p === '/api/admin/categories' && method === 'GET') {
    return json(res, 200, categories.map((c) => ({ id: c.id, slug: c.slug, name_he: c.name_he })));
  }

  if (p === '/api/admin/wines' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    let rows = wines.map(enrich).sort((a, b) => (a.out_of_stock - b.out_of_stock) || String(a.name).localeCompare(String(b.name), 'he'));
    if (search) {
      rows = rows.filter((w) => String(w.name || '').toLowerCase().includes(search) || String(w.winery || '').toLowerCase().includes(search));
    }
    return json(res, 200, rows);
  }

  if (p === '/api/admin/wines' && method === 'POST') {
    const body = await readJson(req);
    if (!body || !body.name || !body.category_id || body.sale_price === undefined) {
      return json(res, 400, { error: 'חסרים שדות חובה: שם, קטגוריה, מחיר מבצע' });
    }
    const cat = catById.get(Number(body.category_id));
    if (!cat) return json(res, 400, { error: 'קטגוריה לא תקינה' });
    const w = enrich({
      id: nextId++,
      name: body.name,
      winery: body.winery || '',
      country: body.country || 'ישראל',
      vintage: body.vintage || '',
      grape: body.grape || '',
      rating: body.rating ?? null,
      shelf_price: body.shelf_price ?? body.sale_price,
      sale_price: body.sale_price,
      notes: body.notes || '',
      image_url: '',
      image_version: 0,
      out_of_stock: body.out_of_stock ? 1 : 0,
      category_id: cat.id,
      category: cat.slug,
      category_he: cat.name_he,
    });
    wines.push(w);
    return json(res, 201, w);
  }

  const wineMatch = p.match(/^\/api\/admin\/wines\/(\d+)$/);
  if (wineMatch) {
    const id = Number(wineMatch[1]);
    const idx = wines.findIndex((w) => w.id === id);
    if (idx < 0) return json(res, 404, { error: 'לא נמצא' });
    if (method === 'PUT') {
      const body = await readJson(req);
      if (!body) return json(res, 400, { error: 'JSON לא תקין' });
      const fields = ['name', 'category_id', 'winery', 'country', 'vintage', 'grape', 'rating', 'shelf_price', 'sale_price', 'notes', 'out_of_stock'];
      for (const f of fields) {
        if (body[f] !== undefined) wines[idx][f] = f === 'out_of_stock' ? (body[f] ? 1 : 0) : body[f];
      }
      wines[idx] = enrich(wines[idx]);
      return json(res, 200, wines[idx]);
    }
    if (method === 'DELETE') {
      wines.splice(idx, 1);
      recommendedIds = recommendedIds.filter((x) => x !== id);
      return json(res, 200, { ok: true });
    }
  }

  const stockMatch = p.match(/^\/api\/admin\/wines\/(\d+)\/stock$/);
  if (stockMatch && method === 'PATCH') {
    const id = Number(stockMatch[1]);
    const w = wines.find((x) => x.id === id);
    if (!w) return json(res, 404, { error: 'לא נמצא' });
    const body = await readJson(req);
    w.out_of_stock = body && body.out_of_stock ? 1 : 0;
    return json(res, 200, { ok: true, out_of_stock: !!w.out_of_stock });
  }

  const imgMatch = p.match(/^\/api\/admin\/wines\/(\d+)\/image$/);
  if (imgMatch && method === 'POST') {
    const id = Number(imgMatch[1]);
    const w = wines.find((x) => x.id === id);
    if (!w) return json(res, 404, { error: 'לא נמצא' });
    await readBody(req); // accept multipart, ignore bytes in preview
    w.image_version = (w.image_version || 0) + 1;
    if (!w.image_url) w.image_url = `/images/wines/preview-${id}.jpg`;
    return json(res, 200, enrich(w));
  }

  if (p === '/api/admin/recommended' && method === 'GET') {
    return json(res, 200, recommendedRows());
  }

  if (p === '/api/admin/recommended' && method === 'PUT') {
    const body = await readJson(req);
    if (!body || !Array.isArray(body.wine_ids)) return json(res, 400, { error: 'נדרש מערך wine_ids' });
    if (body.wine_ids.length > 50) return json(res, 400, { error: 'ניתן לבחור עד 50 יינות' });
    const unique = [...new Set(body.wine_ids.map((id) => parseInt(id, 10)).filter((id) => id > 0))];
    recommendedIds = unique.filter((id) => wines.some((w) => w.id === id));
    return json(res, 200, recommendedRows());
  }

  if (p === '/api/admin/recommended' && method === 'POST') {
    const body = await readJson(req);
    const wineId = parseInt(body && body.wine_id, 10);
    if (!wineId || !wines.some((w) => w.id === wineId)) return json(res, 400, { error: 'יין לא תקין' });
    if (!recommendedIds.includes(wineId)) {
      if (recommendedIds.length >= 50) return json(res, 400, { error: 'ניתן לבחור עד 50 יינות' });
      recommendedIds.push(wineId);
    }
    return json(res, 200, recommendedRows());
  }

  const recDel = p.match(/^\/api\/admin\/recommended\/(\d+)$/);
  if (recDel && method === 'DELETE') {
    const wineId = Number(recDel[1]);
    recommendedIds = recommendedIds.filter((id) => id !== wineId);
    return json(res, 200, recommendedRows());
  }

  return json(res, 404, { error: 'not found' });
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const p = url.pathname;

      if (p === '/api/health') return json(res, 200, { status: 'ok', port: PORT, root: ROOT, admin: true });

      if (p.startsWith('/api/admin')) return handleAdmin(req, res, url);

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
          recommendedIds.map((id) => wines.find((w) => w.id === id)).filter((w) => w && !w.out_of_stock).map(enrich)
        );
      }
      const m = p.match(/^\/api\/wines\/(\d+)$/);
      if (m) {
        const w = wines.find((x) => x.id === Number(m[1]));
        return w ? json(res, 200, enrich(w)) : json(res, 404, { error: 'יין לא נמצא' });
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
    } catch (err) {
      console.error(err);
      json(res, 500, { error: 'server error' });
    }
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`Wine Knot preview http://localhost:${PORT}`);
    console.log(`  ROOT=${ROOT}`);
    console.log(`  admin mock: /admin.html`);
    if (BANNER) console.log(`  BANNER=${BANNER}`);
  });
