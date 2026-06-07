const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'wineknot',
  password: process.env.DB_PASSWORD || 'wineknot_pass',
  database: process.env.DB_NAME || 'wineknot',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

module.exports = pool;
