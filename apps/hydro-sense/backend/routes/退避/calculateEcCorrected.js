// routes/calculateEcCorrected.js

const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/calculate-ec-corrected', async (req, res) => {
  const { serial_number, ec_raw, temperature } = req.body;

  if (!serial_number || typeof ec_raw !== 'number' || typeof temperature !== 'number') {
    return res.status(400).json({ error: '不正な入力です' });
  }

  try {
    const result = await db.query(
      `SELECT calculate_ec_corrected($1, $2, $3) AS ec_corrected`,
      [ec_raw, temperature, serial_number]
    );

    const value = result.rows[0]?.ec_corrected;
    if (value === null || value === undefined) {
      return res.status(400).json({ error: '補正値が計算できませんでした（センサー定義不足など）' });
    }

    res.json({ ec_corrected: Number(value.toFixed(3)) });
  } catch (err) {
    console.error('🔥 EC補正APIエラー:', err);
    res.status(500).json({ error: '補正値の計算に失敗しました' });
  }
});

module.exports = router;
