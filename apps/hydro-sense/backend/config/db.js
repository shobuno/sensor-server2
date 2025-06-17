// config/db.js
const { Pool } = require('pg');

// 環境変数から読み込む構成（.env推奨）
const pool = new Pool({
  user: process.env.PGUSER || 'nobu',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'sensor_data',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
