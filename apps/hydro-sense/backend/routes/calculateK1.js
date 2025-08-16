//sensor-server/apps/hydro-sense/backend/routes/calculateK1.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

// K1計算: Vexc/Vfs/Nadc分離, RaはΩ, Rw一本化, K1 = EC25 * Rw
router.post('/', async (req, res) => {
  const { serial_number, target_ec, ec_avg, temperature } = req.body;

  // 0は有効値なので null/undefined をチェック
  if (!serial_number || target_ec == null || ec_avg == null || temperature == null) {
    return res.status(400).json({ error: '不正な入力です' });
  }

  try {
    const sensorRes = await db.query(
      `SELECT
         const_k1,
         const_vexc,
         const_ra_ohm,
         const_temperature_coef AS coef,
         const_adc_fs,
         const_adc_counts,
         const_vin  AS vin_old,   -- 旧: 実態はADC FS
         const_ra   AS ra_old     -- 旧: kΩの可能性(例: 22)
       FROM sensor_master
       WHERE serial_number = $1`,
      [serial_number]
    );

    if (sensorRes.rows.length === 0) {
      return res.status(404).json({ error: 'センサーが見つかりません' });
    }

    const row = sensorRes.rows[0];

    // --- 定数の確定（フォールバック含む） ---
    const vexc = (row.const_vexc != null) ? Number(row.const_vexc) : 3.300; // 実測で更新推奨
    let ra_ohm  = (row.const_ra_ohm != null) ? Number(row.const_ra_ohm) : null;
    if (ra_ohm == null && row.ra_old != null) {
      const raOld = Number(row.ra_old);
      ra_ohm = raOld < 1000 ? raOld * 1000 : raOld; // 22 → 22000Ω
    }

    const vfs  = (row.const_adc_fs != null) ? Number(row.const_adc_fs)
                : (row.vin_old != null)     ? Number(row.vin_old) // 旧vin=4.096を流用
                : 4.096;
    const nadc = (row.const_adc_counts != null) ? Number(row.const_adc_counts) : 32768; // ADS1115
    const alpha = (row.coef != null) ? Number(row.coef) : 0.02;

    if (vexc <= 0 || !isFinite(vexc) ||
        ra_ohm == null || ra_ohm <= 0 || !isFinite(ra_ohm) ||
        vfs <= 0 || !isFinite(vfs) ||
        nadc <= 0 || !isFinite(nadc)) {
      return res.status(400).json({ error: 'センサ定数が不正です（vexc/ra_ohm/vfs/nadc）' });
    }

    // --- 測定値・温度 ---
    const raw = Number(ec_avg);
    const tempC = Number(temperature);
    const tgtEC = Number(target_ec);

    // --- ADCカウント → 電圧 ---
    const vdrop = (vfs * raw) / nadc;
    if (vdrop <= 0 || vdrop >= vexc || !isFinite(vdrop)) {
      return res.status(400).json({ error: `Vdrop(${vdrop.toFixed(6)}V)が異常です（Vexc=${vexc}V）。` });
    }

    // --- 溶液抵抗: Rw = (Vdrop * Ra) / (Vexc - Vdrop) ---
    const rw_ohm = (vdrop * ra_ohm) / (vexc - vdrop);
    if (rw_ohm <= 0 || !isFinite(rw_ohm)) {
      return res.status(400).json({ error: '溶液抵抗の計算に失敗（rw_ohm<=0）' });
    }

   // --- 目標EC（25℃基準）の決め方 ---
   // 校正液や多くのハンディ計は「25℃補正後の値」を表示するため、
   // target_ec は 25℃規格値(mS/cm)として扱うのが安全
   const ec25_mScm = tgtEC; // もし現温度のECを入れる運用なら: tgtEC / (1 + alpha*(tempC-25))
   if (ec25_mScm <= 0 || !isFinite(ec25_mScm)) {
      return res.status(400).json({ error: '目標EC(25℃換算)が不正です' });
   }

    // --- K1の正方向: K1 = EC25[S/cm] × Rw[Ω]
    const ec25_Scm = ec25_mScm / 1000.0;   // ★ mS/cm → S/cm に変換
    const k1 = ec25_Scm * rw_ohm;          // 単位整合


    // ログ用の参考値
    const ec_w_raw = 1000.0 * (k1 / rw_ohm);   // mS/cm（現温度相当の概算）
    const ec_w_25  = ec25_mScm;                // mS/cm（25℃換算）

    // --- 保存 ---
    await db.query(
      `UPDATE sensor_master SET const_k1 = $1 WHERE serial_number = $2`,
      [k1, serial_number]
    );

    await db.query(
      `INSERT INTO ec_k1_calibration_log
         (serial_number, target_ec, ec_avg, temperature, ec_w_raw, ec_w_25,
          calculated_k1, vin, ra, temperature_coef, calculated_at, k1)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, NOW(), $7)`,
      [
        serial_number,
        tgtEC,
        raw,
        tempC,
        ec_w_raw,
        ec_w_25,
        k1,
        vexc,   // 互換のため vin 列に Vexc を保存
        ra_ohm, // Ωで保存
        alpha
      ]
    );

    return res.json({
      k1: Number(k1.toFixed(6)),
      debug: {
        vexc, vfs, nadc, ra_ohm,
        vdrop: Number(vdrop.toFixed(6)),
        rw_ohm: Number(rw_ohm.toFixed(2)),
        ec25_mScm: Number(ec_w_25.toFixed(3))
      },
      message: 'K1計算完了・保存しました'
    });
  } catch (err) {
    console.error('🔥 K1計算エラー:', err);
    return res.status(500).json({ error: 'K1計算に失敗しました' });
  }
});

module.exports = router;
