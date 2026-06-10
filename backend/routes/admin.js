const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const storage = require('../lib/storage');
const logger = require('../lib/logger');
const { parseSearchParam } = require('../lib/queryLimits');
const { requireAdmin } = require('../lib/adminAuth');
const { isValidImageBuffer } = require('../lib/imageValidate');

const router = express.Router();

router.use(requireAdmin);

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

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (IMAGE_EXTS.has(ext)) return cb(null, true);
    cb(new Error('רק קבצי תמונה'));
  },
});

function imageExt(mimetype, originalname) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.jpg',
    'image/heif': '.jpg',
  };
  if (map[mimetype]) return map[mimetype];
  const ext = path.extname(originalname || '').toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  if (IMAGE_EXTS.has(ext)) return ext === '.heic' || ext === '.heif' ? '.jpg' : ext;
  return '.jpg';
}

router.get('/wines', async (req, res) => {
  try {
    const search = parseSearchParam(req.query.search);
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

const MAX_RECOMMENDED = 50;

async function fetchRecommendedRows() {
  const [rows] = await pool.query(
    `SELECT w.*, c.slug AS category, c.name_he AS category_he, r.sort_order
     FROM recommended_wines r
     JOIN wines w ON w.id = r.wine_id
     JOIN categories c ON c.id = w.category_id
     ORDER BY r.sort_order ASC, r.wine_id ASC`
  );
  return rows.map((row) => ({
    ...row,
    image_url: storage.resolveImageUrl(row.image_url),
  }));
}

router.get('/recommended', async (_req, res) => {
  try {
    res.json(await fetchRecommendedRows());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינת מומלצים' });
  }
});

router.put('/recommended', async (req, res) => {
  try {
    const { wine_ids: wineIds } = req.body;
    if (!Array.isArray(wineIds)) {
      return res.status(400).json({ error: 'נדרש מערך wine_ids' });
    }
    if (wineIds.length > MAX_RECOMMENDED) {
      return res.status(400).json({ error: `ניתן לבחור עד ${MAX_RECOMMENDED} יינות` });
    }
    const unique = [...new Set(wineIds.map((id) => parseInt(id, 10)).filter((id) => id > 0))];
    if (unique.length !== wineIds.length) {
      return res.status(400).json({ error: 'רשימה לא תקינה — יינות כפולים או חסרים' });
    }
    if (unique.length) {
      const placeholders = unique.map(() => '?').join(',');
      const [found] = await pool.query(
        `SELECT id FROM wines WHERE id IN (${placeholders})`,
        unique
      );
      if (found.length !== unique.length) {
        return res.status(400).json({ error: 'חלק מהיינות לא נמצאו' });
      }
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM recommended_wines');
      for (let i = 0; i < unique.length; i++) {
        await conn.query(
          'INSERT INTO recommended_wines (wine_id, sort_order) VALUES (?, ?)',
          [unique[i], i]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.json(await fetchRecommendedRows());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בשמירת מומלצים' });
  }
});

router.post('/recommended', async (req, res) => {
  try {
    const wineId = parseInt(req.body.wine_id, 10);
    if (!wineId) return res.status(400).json({ error: 'נדרש wine_id' });
    const [rows] = await pool.query('SELECT id FROM wines WHERE id = ?', [wineId]);
    if (!rows.length) return res.status(404).json({ error: 'יין לא נמצא' });
    const [existing] = await pool.query(
      'SELECT wine_id FROM recommended_wines WHERE wine_id = ?',
      [wineId]
    );
    if (existing.length) return res.status(400).json({ error: 'היין כבר ברשימת המומלצים' });
    const [countRows] = await pool.query('SELECT COUNT(*) AS n FROM recommended_wines');
    if (countRows[0].n >= MAX_RECOMMENDED) {
      return res.status(400).json({ error: `ניתן לבחור עד ${MAX_RECOMMENDED} יינות` });
    }
    await pool.query(
      'INSERT INTO recommended_wines (wine_id, sort_order) VALUES (?, ?)',
      [wineId, countRows[0].n]
    );
    res.status(201).json(await fetchRecommendedRows());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בהוספה למומלצים' });
  }
});

router.delete('/recommended/:wineId', async (req, res) => {
  try {
    const wineId = parseInt(req.params.wineId, 10);
    const [result] = await pool.query(
      'DELETE FROM recommended_wines WHERE wine_id = ?',
      [wineId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'לא ברשימת המומלצים' });
    const [remaining] = await pool.query(
      'SELECT wine_id FROM recommended_wines ORDER BY sort_order ASC, wine_id ASC'
    );
    for (let i = 0; i < remaining.length; i++) {
      await pool.query(
        'UPDATE recommended_wines SET sort_order = ? WHERE wine_id = ?',
        [i, remaining[i].wine_id]
      );
    }
    res.json(await fetchRecommendedRows());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בהסרה ממומלצים' });
  }
});

router.post('/wines/:id/image', async (req, res, next) => {
  const wineId = req.params.id;
  try {
    const [rows] = await pool.query(
      'SELECT id, name, winery, vintage FROM wines WHERE id = ?',
      [wineId]
    );
    if (!rows.length) {
      logger.warn('wine_image_upload', { wineId, status: 'not_found' });
      return res.status(404).json({ error: 'לא נמצא' });
    }
    req.wineRow = rows[0];
    next();
  } catch (err) {
    logger.error('wine_image_upload', { wineId, status: 'lookup_failed', error: err.message });
    next(err);
  }
}, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    const fields = {
      wineId: req.params.id,
      status: 'multer_rejected',
      code: err.code,
      error: err.message,
    };
    logger.warn('wine_image_upload', fields);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'הקובץ גדול מדי (מקסימום 8MB)' });
    }
    return res.status(400).json({ error: err.message || 'קובץ לא תקין' });
  });
}, async (req, res) => {
  const wineId = req.params.id;
  try {
    if (!req.file) {
      logger.warn('wine_image_upload', {
        wineId,
        status: 'no_file',
        contentType: req.headers['content-type'],
      });
      return res.status(400).json({ error: 'לא נבחרה תמונה' });
    }

    if (!isValidImageBuffer(req.file.buffer)) {
      logger.warn('wine_image_upload', {
        wineId,
        status: 'invalid_content',
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      return res.status(400).json({ error: 'קובץ התמונה אינו תקין' });
    }

    const ext = imageExt(req.file.mimetype, req.file.originalname);
    const filename = wineImageFilename(req.wineRow, ext);
    logger.info('wine_image_upload', {
      wineId,
      status: 'started',
      filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      storage: storage.useS3() ? 's3' : 'local',
    });

    const imageUrl = await storage.saveImage(filename, req.file.buffer, req.file.mimetype);
    await pool.query('UPDATE wines SET image_url = ? WHERE id = ?', [imageUrl, wineId]);

    logger.info('wine_image_upload', {
      wineId,
      status: 'ok',
      filename,
      imageUrl,
      size: req.file.size,
    });
    res.json({ ok: true, image_url: imageUrl });
  } catch (err) {
    logger.error('wine_image_upload', {
      wineId,
      status: 'failed',
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'שגיאה בהעלאה' });
  }
});

module.exports = router;
