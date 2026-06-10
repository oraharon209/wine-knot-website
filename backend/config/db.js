const mysql = require('mysql2/promise');

const password = process.env.DB_PASSWORD;
if (!password) {
  throw new Error('DB_PASSWORD environment variable is required');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'wineknot',
  password,
  database: process.env.DB_NAME || 'wineknot',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
