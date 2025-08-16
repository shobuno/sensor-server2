// sensor-server/apps/hydro-sense/backend/routes/calculateK1.js


const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.post('/', async (req, res) => {
  const { serial_number, target_ec, ec_avg, temperature } = req.body;

  // number系のゼロは許容するので厳密にnull/undefinedチェック
  if (!serial_number || target_ec == null || ec_avg == null || temperature == null) {
    return res.status(400).json({ error: '不正な入力です' });
  }

  try {
    // センサーマスターから定数取得（新カラム優先、旧カラムはフォールバック）
    const sensorRes = await db.query(
      `SELECT
         const_k1,
         const_vexc,                 -- 新: 励起電圧[V]
         const_ra_ohm,               -- 新: 直列抵抗[Ω]
         const_temperature_coef AS coef,
         const_adc_fs,               -- 新: ADCフルスケール[V]
         const_adc_counts,           -- 新: ADC分母（ADS1115=32768）
         const_vin AS vin_old,       -- 旧: 実態はADC FSとして使っていた値
         const_ra  AS ra_old         -- 旧: kΩの可能性有り（22など）
       FROM sensor_master
       WHERE serial_number = $1`,
      [serial_number]
    );

    if (sensorRes.rows.length === 0) {
      return res.status(404).json({ error: 'センサーが見つかりません' });
    }

    const row = sensorRes.rows[0];

    // ---- 定数整理（フォールバック込） ----
    // 励起電圧（Vexc）
    const vexc = (row.const_vexc != null) ? Number(row.const_vexc) : 3.300; // 実測で更新推奨

    // 直列抵抗（Ω）
    let ra_ohm = row.const_ra_ohm != null ? Number(row.const_ra_ohm) : null;
    if (ra_ohm == null && row.ra_old != null) {
      const raOld = Number(row.ra_old);
      // 旧はkΩの可能性に配慮（22 → 22000Ω）
      ra_ohm = raOld < 1000 ? raOld * 1000 : raOld;
    }

    // ADC定数（Vfs / Nadc）
    const vfs   = (row.const_adc_fs != null) ? Number(row.const_adc_fs)
                  : (row.vin_old != null)    ? Number(row.vin_old) // 旧vin=4.096 を流用
                  : 4.096;
    const nadc  = (row.const_adc_counts != null) ? Number(row.const_adc_counts) : 32768; // ADS1115

    const alpha = row.coef != null ? Number(row.coef) : 0.02;

    if (vexc <= 0 || ra_ohm == null || ra_ohm <= 0 || vfs <= 0 || nadc <= 0) {
