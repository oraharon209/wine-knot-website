const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { requireAdmin, checkPassword, adminToken } = require('../middleware/auth');
const storage = require('../lib/storage');

const router = express.Router();

function wineImageLabel(wine) {
  const winery = (wine.winery || '').split('/')[0].split('(')[0].trim().replace(/\s+/g, ' ');
  const name = (wine.name || '').trim().replace(/\s+/g, ' ');
  const years = [];
  if (wine.vintage) years.push(String(wine.vintage).trim());
  const yearInName = name.match(/20\d{2}/);
  if (yearInName) years.push(yearInName[0]);
  const uniqueYears = [...new Set(years)];
  let label = winery ? `${winery} - ${name}` : name;
  if (uniqueYears.length && !/20\d{2}/.test(name)) {
    label += ` ${uniqueYears[0]}`;
  }
  return label.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
}

function wineImageFilename(wine, ext = '.jpg') {
  return `${wineImageLabel(wine)}${ext === '.jpeg' ? '.jpg' : ext}`;
}

function wineImageUrl(wine) {
  return storage.publicUrl(wineImageFilename(wine));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('רק קבצי תמונה'));
  },
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }
  res.json({ token: adminToken(), ok: true });
});

router.use(requireAdmin);

router.get('/wines', async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `SELECT w.*, c.slug AS category, c.name_he AS category_he
               FROM wines w JOIN categories c ON c.id = w.category_id`;
    const params = [];
    if (search) {
      sql += ` WHERE w.name LIKE ? OR w.winery LIKE ?`;
      const term = `%${search}%`;
      params.push(term, term);
    }
    sql += ' ORDER BY w.out_of_stock ASC, w.name ASC';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map((row) => ({
      ...row,
      image_url: storage.resolveImageUrl(row.image_url),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינה' });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, slug, name_he FROM categories ORDER BY sort_order');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

router.post('/wines', async (req, res) => {
  try {
    const {
      name, category_id, winery, country, vintage, grape,
      rating, shelf_price, sale_price, notes, out_of_stock,
    } = req.body;
    if (!name || !category_id || sale_price === undefined) {
      return res.status(400).json({ error: 'חסרים שדות חובה: שם, קטגוריה, מחיר מבצע' });
    }
    const [result] = await pool.query(
      `INSERT INTO wines (name, category_id, winery, country, vintage, grape, rating,
        shelf_price, sale_price, notes, image_url, out_of_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, category_id, winery || '', country || 'ישראל', vintage || '', grape || '',
        rating || null, shelf_price || sale_price, sale_price, notes || '',
        wineImageUrl({ name, winery, vintage }), out_of_stock ? 1 : 0,
      ]
    );
    const id = result.insertId;
    const [rows] = await pool.query(
      `SELECT w.*, c.slug AS category, c.name_he AS category_he
       FROM wines w JOIN categories c ON c.id = w.category_id WHERE w.id = ?`,
      [id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בהוספה' });
  }
});

router.put('/wines/:id', async (req, res) => {
  try {
    const fields = [
      'name', 'category_id', 'winery', 'country', 'vintage', 'grape', 'rating',
      'shelf_price', 'sale_price', 'notes', 'out_of_stock',
    ];
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
    const [rows] = await pool.query(
      `SELECT w.*, c.slug AS category, c.name_he AS category_he
       FROM wines w JOIN categories c ON c.id = w.category_id WHERE w.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'לא נמצא' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
});

router.delete('/wines/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, image_url FROM wines WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'לא נמצא' });
    const imageUrl = rows[0].image_url;
    await pool.query('DELETE FROM wines WHERE id = ?', [req.params.id]);
    await storage.deleteImage(imageUrl);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
});

router.patch('/wines/:id/stock', async (req, res) => {
  try {
    const out = req.body.out_of_stock ? 1 : 0;
    await pool.query('UPDATE wines SET out_of_stock = ? WHERE id = ?', [out, req.params.id]);
    res.json({ ok: true, out_of_stock: !!out });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

router.post('/wines/:id/image', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, winery, vintage FROM wines WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'לא נמצא' });
    req.wineImageName = wineImageFilename(rows[0]);
    next();
  } catch (err) {
    next(err);
  }
}, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'לא נבחרה תמונה' });
    const filename = req.wineImageName || `${req.params.id}.jpg`;
    const imageUrl = await storage.saveImage(filename, req.file.buffer, req.file.mimetype);
    await pool.query('UPDATE wines SET image_url = ? WHERE id = ?', [imageUrl, req.params.id]);
    res.json({ ok: true, image_url: imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'שגיאה בהעלאה' });
  }
});

module.exports = router;
