const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const IMG_DIR = process.env.IMAGE_DIR || path.join(__dirname, 'uploads', 'images', 'wines');

async function backfillImageVersions() {
  const [wines] = await pool.query(
    'SELECT id, image_url FROM wines WHERE image_url IS NOT NULL AND image_url != "" AND image_version = 0'
  );
  for (const wine of wines) {
    const filename = path.basename(wine.image_url);
    if (!filename) continue;
    const filePath = path.join(IMG_DIR, filename);
    try {
      const { mtimeMs } = fs.statSync(filePath);
      await pool.query('UPDATE wines SET image_version = ? WHERE id = ?', [Math.floor(mtimeMs), wine.id]);
    } catch {
      // missing file — leave at 0 until next upload
    }
  }
}

async function migrate() {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wines' AND COLUMN_NAME = 'out_of_stock'`
  );
  if (!cols.length) {
    await pool.query(
      'ALTER TABLE wines ADD COLUMN out_of_stock TINYINT(1) NOT NULL DEFAULT 0 AFTER image_url'
    );
    console.log('Migration: added out_of_stock column');
  }

  const [tables] = await pool.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recommended_wines'`
  );
  if (!tables.length) {
    await pool.query(`
      CREATE TABLE recommended_wines (
        wine_id INT NOT NULL PRIMARY KEY,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE
      )
    `);
    console.log('Migration: created recommended_wines table');
  }

  const [recCount] = await pool.query('SELECT COUNT(*) AS n FROM recommended_wines');
  if (recCount[0].n === 0) {
    const seed = [
      [89, 1],
      [90, 2],
      [32, 3],
    ];
    for (const [wineId, sortOrder] of seed) {
      const [exists] = await pool.query('SELECT id FROM wines WHERE id = ?', [wineId]);
      if (exists.length) {
        await pool.query(
          'INSERT INTO recommended_wines (wine_id, sort_order) VALUES (?, ?)',
          [wineId, sortOrder]
        );
      }
    }
    console.log('Migration: seeded recommended_wines');
  }

  const [versionCol] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wines' AND COLUMN_NAME = 'image_version'`
  );
  if (!versionCol.length) {
    await pool.query(
      'ALTER TABLE wines ADD COLUMN image_version BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER image_url'
    );
    console.log('Migration: added image_version column');
    await backfillImageVersions();
    console.log('Migration: backfilled image_version from file mtimes');
  }
}

module.exports = migrate;
