const pool = require('./config/db');

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
}

module.exports = migrate;
