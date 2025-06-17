// routes/registerEcLog.js
const express = require("express");
const router = express.Router();
const path = require("path");
const db = require(path.resolve(__dirname, "../config/db"));


// POST /api/register-ec-log
router.post("/", async (req, res) => {
  const { serial_number, target_ec, ec_avg, temperature } = req.body;

  if (!serial_number || target_ec == null || ec_avg == null || temperature == null) {
    return res.status(400).json({ error: "不正なリクエストです" });
  }

  try {
    // sensor_master から定数を取得
    const result = await db.query(
      `SELECT const_k1, const_vin, const_ra, const_temperature_coef
       FROM sensor_master WHERE serial_number = $1`,
      [serial_number]
    );

    const sensor = result.rows[0];
    if (!sensor) return res.status(404).json({ error: "センサーが見つかりません" });

    const { const_k1: k1, const_vin: vin, const_ra: ra, const_temperature_coef: temp_coef } = sensor;

    // 計算
    const r1 = 1000 + ra;
    const vdrop = (vin * ec_avg) / 4096.0;
    const vdiff = vin - vdrop;

    if (vdiff === 0) return res.status(400).json({ error: "Vin - Vdrop が 0 です" });

    const rc = (vdrop * r1) / vdiff - ra;
    if (rc <= 0) return res.status(400).json({ error: "抵抗値が不正です" });

    const wec = 1000 / (rc * k1);
    const wec25 = wec / (1 + temp_coef * (temperature - 25.0));

    // DBへ記録
    await db.query(
      `INSERT INTO ec_k1_calibration_log (
        serial_number, target_ec, ec_avg, temperature,
        vin, ra, temperature_coef, k1, ec_w_raw, ec_w_25
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [serial_number, target_ec, ec_avg, temperature, vin, ra, temp_coef, k1, wec, wec25]
    );

    res.json({ message: "記録完了" });
  } catch (err) {
    console.error("登録エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

module.exports = router;
