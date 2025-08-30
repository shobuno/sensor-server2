// apps/hydro-sense/backend/routes/sensorInfo.js

const express = require('express');
const router = express.Router();
const path = require('path'); 
const db = require(path.resolve(__dirname, '../config/db'));

// ✅ GET /api/hidro/sensor-serials?type=water
router.get('/sensor-serials', async (req, res) => {
  const type = req.query.type || 'water';
  try {
    const result = await db.query(
      'SELECT serial_number FROM sensor_master WHERE sensor_type = $1 ORDER BY registered_at DESC',
      [type]
    );
    const serials = result.rows.map(row => row.serial_number);
    res.json(serials);
  } catch (err) {
    console.error('🔥 sensor-serialsエラー:', err);
    res.status(500).json({ error: 'センサー情報取得に失敗しました' });
  }
});

// ✅ GET /api/hydro/latest-hourly-avg
router.get('/latest-hourly-avg', async (req, res) => {
  try {
    const result = await db.query(
      "SELECT water_avg, ec_avg FROM sensor_1h_values ORDER BY timestamp DESC LIMIT 1"
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'データが見つかりません' });
    }
    const row = result.rows[0];
    res.json({
      water_avg: row.water_avg,
      ec_avg: row.ec_avg
    });
  } catch (err) {
    console.error('🔥 latest-hourly-avgエラー:', err);
    res.status(500).json({ error: '1時間平均データの取得に失敗しました' });
  }
});

module.exports = router;
