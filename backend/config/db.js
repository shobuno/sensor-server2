// /sensor-server/backend/config/db.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER || 'nobu',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'sensor_data',
  password: process.env.PGPASSWORD || '',
  port: process.env.PGPORT || 5432,
});

module.exports = {
  pool,                                   // ← pool 本体を追加 export
  query: (text, params) => pool.query(text, params),
};
