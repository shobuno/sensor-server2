// routes/waterLevel.js
const express = require('express');
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

const router = express.Router();

// POST: 水位データを登録
router.post('/', async (req, res) => {
  try {
    const { serial_number, water_level } = req.body;

    // バリデーション
    if (!serial_number || typeof water_level !== 'number' || water_level < 0 || water_level > 3) {
      return res.status(400).json({ error: 'Invalid serial_number or water_level (0–3)' });
    }

    const timestamp = new Date();

    await db.query(
      `INSERT INTO water_sensor (serial_number, water_level, timestamp) VALUES ($1, $2, $3)`,
      [serial_number, water_level, timestamp]
    );

    // console.log(`💧 水位データを登録: serial=${serial_number}, level=${water_level}`);
    res.status(200).json({ message: 'Water level inserted successfully.' });
  } catch (err) {
    console.error('🔥 /water-level POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ GET: 最新の水位データ取得
router.get('/latest', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT serial_number, water_level, timestamp
      FROM water_sensor
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No water level data found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('🔥 /water-level/latest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
