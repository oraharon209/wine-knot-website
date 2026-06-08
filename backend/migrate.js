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
}

module.exports = migrate;
