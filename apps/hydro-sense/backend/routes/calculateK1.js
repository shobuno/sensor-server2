//backend/routes/calculateK1.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.post('/', async (req, res) => {
  const { serial_number, target_ec, ec_avg, temperature } = req.body;

  if (!serial_number || !target_ec || !ec_avg || !temperature) {
    return res.status(400).json({ error: '不正な入力です' });
  }

  try {
    // センサーマスターから定数取得
    const sensorRes = await db.query(
      `SELECT const_vin AS vin, const_ra AS ra, const_temperature_coef AS coef
       FROM sensor_master WHERE serial_number = $1`,
      [serial_number]
    );

    if (sensorRes.rows.length === 0) {
      return res.status(404).json({ error: 'センサーが見つかりません' });
    }

    const { vin, ra, coef } = sensorRes.rows[0];

    // EC補正の逆算処理
    const wEC25 = target_ec / (1 + coef * (temperature - 25.0));
    const r1 = 1000 + ra;
    const vdrop = vin * ec_avg / 32768;
    const rc = (vdrop * r1) / (vin - vdrop) - ra;

    if (rc <= 0 || wEC25 <= 0) {
      return res.status(400).json({ error: '抵抗またはEC値が不正です' });
    }

    const k1 = 1000 / (rc * wEC25);
    const ec_w_raw = 1000 / rc;

    // sensor_master を更新
    await db.query(
      `UPDATE sensor_master SET const_k1 = $1 WHERE serial_number = $2`,
      [k1, serial_number]
    );

    // ログを記録
    await db.query(
      `INSERT INTO ec_k1_calibration_log
         (serial_number, target_ec, ec_avg, temperature, ec_w_raw, ec_w_25,
          calculated_k1, vin, ra, temperature_coef)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [serial_number, target_ec, ec_avg, temperature, ec_w_raw, wEC25, k1, vin, ra, coef]
    );

    res.json({ k1: Number(k1.toFixed(3)), message: 'K1計算完了・保存しました' });
  } catch (err) {
    console.error('🔥 K1計算エラー:', err);
    res.status(500).json({ error: 'K1計算に失敗しました' });
  }
});

module.exports = router;
