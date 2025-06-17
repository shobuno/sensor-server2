// routes/latestGraph.js
const express = require('express');
const db = require('../db');

const router = express.Router();

// 最新データ（24時間）をグラフ用に取得
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        timestamp, 
        temperature, 
        water_temperature, 
        ec_corrected 
      FROM v_ec_corrected_values
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      ORDER BY timestamp
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('🔥 /api/latest-graph error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
