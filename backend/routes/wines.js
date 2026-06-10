const express = require('express');
const pool = require('../config/db');
const { resolveImageUrl } = require('../lib/storage');
const {
  parseSearchParam,
  parseMaxPriceParam,
  parseMinRatingParam,
  parseLimitParam,
  parseOffsetParam,
} = require('../lib/queryLimits');

const router = express.Router();

function withResolvedImages(rows) {
  return rows.map((row) => ({
    ...row,
    image_url: resolveImageUrl(row.image_url),
  }));
}

const SORT_MAP = {
  price_asc: 'w.sale_price ASC',
  price_desc: 'w.sale_price DESC',
  rating_desc: 'w.rating DESC',
  name_asc: 'w.name ASC',
};

router.get('/', async (req, res) => {
  try {
    const { category, sort, include_oos } = req.query;
    const search = parseSearchParam(req.query.search);
    const max_price = parseMaxPriceParam(req.query.max_price);
    const min_rating = parseMinRatingParam(req.query.min_rating);
    const conditions = ['w.out_of_stock = 0'];
    const params = [];

    if (include_oos === '1') {
      conditions.shift();
    }

    if (category) {
      conditions.push('c.slug = ?');
      params.push(category);
    }
    if (search) {
      conditions.push(`(
        w.name LIKE ? OR w.winery LIKE ? OR w.notes LIKE ? OR w.country LIKE ? OR w.grape LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }
    if (max_price != null) {
      conditions.push('w.sale_price <= ?');
      params.push(max_price);
    }
    if (min_rating != null) {
      conditions.push('w.rating >= ?');
      params.push(min_rating);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = SORT_MAP[sort] || 'w.sale_price ASC';
    const baseFrom = `FROM wines w JOIN categories c ON c.id = w.category_id ${where}`;

    const limitNum = parseLimitParam(req.query.limit);
    const offsetNum = parseOffsetParam(req.query.offset);

    if (limitNum > 0) {
      const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`, params);
      const pageParams = [...params];
      let sql = `SELECT w.*, c.slug AS category, c.name_he AS category_he ${baseFrom} ORDER BY ${orderBy} LIMIT ?`;
      pageParams.push(limitNum);
      if (offsetNum > 0) {
        sql += ' OFFSET ?';
        pageParams.push(offsetNum);
      }
      const [rows] = await pool.query(sql, pageParams);
      return res.json({
        wines: withResolvedImages(rows),
        total: countRows[0].total,
      });
    }

    const [rows] = await pool.query(
      `SELECT w.*, c.slug AS category, c.name_he AS category_he ${baseFrom} ORDER BY ${orderBy}`,
      params
    );
    res.json(withResolvedImages(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינת יינות' });
  }
});

router.get('/recommended', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.*, c.slug AS category, c.name_he AS category_he
       FROM recommended_wines r
       JOIN wines w ON w.id = r.wine_id
       JOIN categories c ON c.id = w.category_id
       WHERE w.out_of_stock = 0
       ORDER BY r.sort_order ASC, r.wine_id ASC`
    );
    res.json(withResolvedImages(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינת מומלצים' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.*, c.slug AS category, c.name_he AS category_he
       FROM wines w
       JOIN categories c ON c.id = w.category_id
       WHERE w.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'יין לא נמצא' });
    res.json(withResolvedImages(rows)[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינת יין' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, category_id, winery, country, vintage, grape, rating, shelf_price, sale_price, notes } = req.body;
    const [result] = await pool.query(
      `INSERT INTO wines (name, category_id, winery, country, vintage, grape, rating, shelf_price, sale_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category_id, winery, country, vintage, grape, rating, shelf_price, sale_price, notes]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בהוספת יין' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const fields = ['name', 'category_id', 'winery', 'country', 'vintage', 'grape', 'rating', 'shelf_price', 'sale_price', 'notes', 'out_of_stock'];
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(f === 'out_of_stock' ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'אין שדות לעדכון' });
    params.push(req.params.id);
    await pool.query(`UPDATE wines SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בעדכון יין' });
  }
});

module.exports = router;
