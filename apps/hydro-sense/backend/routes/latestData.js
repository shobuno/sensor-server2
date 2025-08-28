// sensor-server/apps/hydro-sense/backend/routes/latestData.js

const express = require('express');
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

const router = express.Router();

// 1リクエスト10秒の保険（アプリ全体にもグローバルtimeoutがあると尚良）
function withTimeout(promise, ms = 10_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`query-timeout-${ms}ms`)), ms)
    ),
  ]);
}

router.get('/', async (req, res, next) => {
  // 到達ログ（必要ならコメントアウトOK）
  //console.log('▶ GET /api/hydro/latest');

  try {
    // --- クエリ並列実行 ---
    const [
      airRes,
      waterRes,
      ecRes,
      waterLevelRes,
      k1Res,
      modelRes,
    ] = await withTimeout(Promise.all([
      db.query(`
        SELECT r.temperature, r.timestamp
        FROM sensor_raw_data r
        JOIN sensor_master m ON r.serial_number = m.serial_number
        WHERE m.sensor_type = 'air'
        ORDER BY r.timestamp DESC
        LIMIT 1
      `),

      db.query(`
        SELECT r.temperature
        FROM sensor_raw_data r
        JOIN sensor_master m ON r.serial_number = m.serial_number
        WHERE m.sensor_type = 'water'
        ORDER BY r.timestamp DESC
        LIMIT 1
      `),

      // ▼ 副問い合わせに LIMIT 1 を明示して多行例外を防止
      db.query(`
        SELECT
          r.ec_raw,
          calculate_ec_corrected(
            r.ec_raw,
            (
              SELECT srd.temperature
              FROM sensor_raw_data srd
              WHERE srd.serial_number = (
                SELECT sm.serial_number
                FROM sensor_master sm
                WHERE sm.sensor_type = 'water'
                ORDER BY sm.serial_number DESC
                LIMIT 1
              )
              ORDER BY srd.timestamp DESC
              LIMIT 1
            ),
            wm.serial_number
          ) AS ec25_corrected
        FROM sensor_raw_data r
        JOIN LATERAL (
          SELECT sm.serial_number
          FROM sensor_master sm
          WHERE sm.sensor_type = 'water'
          ORDER BY sm.serial_number DESC
          LIMIT 1
        ) wm ON true
        WHERE r.ec_raw IS NOT NULL
        ORDER BY r.timestamp DESC
        LIMIT 1
      `),

      db.query(`
        SELECT water_level
        FROM water_sensor
        ORDER BY timestamp DESC
        LIMIT 1
      `),

      db.query(`
        SELECT k1, vin, r1, ra, temp_coefficient
        FROM ec_conversion_constants
        ORDER BY created_at DESC
        LIMIT 1
      `),

      db.query(`
        SELECT model_type, a, b, c
        FROM ec25_correction_model
        ORDER BY created_at DESC
        LIMIT 1
      `),
    ]));

    const airRow = airRes.rows[0] || null;
    if (!airRow) {
      return res.status(404).json({ error: '最新の気温データが見つかりません' });
    }

    const waterRow = waterRes.rows[0] || {};
    const ecRow = ecRes.rows[0] || {};
    const waterLevelRow = waterLevelRes.rows[0] || {};
    // k1Res, modelRes は今は未使用だが残しておく（将来の計算用）
    void k1Res; void modelRes;

    const airTimestamp = airRow.timestamp; // DBの型がtimestamp/timestamptz想定
    const isoTimestamp = airTimestamp ? new Date(airTimestamp).toISOString() : null;

    const payload = {
      timestamp: isoTimestamp,                          // ← Zのまま（フロントでJST表示OK）
      temperature: airRow.temperature ?? null,
      water_temperature: waterRow.temperature ?? null,
      ec: ecRow.ec_raw ?? null,
      ec25_corrected: ecRow.ec25_corrected ?? null,
      water_level: waterLevelRow.water_level ?? null,
    };

    if (!res.headersSent) res.status(200).json(payload);
  } catch (err) {
    console.error('💥 /api/hydro/latest error:', err);
    // タイムアウトやDB例外は next(err) で共通ハンドラへ
    if (res.headersSent) return;
    return next(err);
  }
});

// モジュール内エラーハンドラ（未送信なら500で返す）
router.use((err, _req, res, _next) => {
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

