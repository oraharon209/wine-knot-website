const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.slug, c.name_he, COUNT(w.id) AS wine_count
      FROM categories c
      LEFT JOIN wines w ON w.category_id = c.id
      GROUP BY c.id, c.slug, c.name_he
      ORDER BY c.sort_order
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בטעינת קטגוריות' });
  }
});

module.exports = router;
