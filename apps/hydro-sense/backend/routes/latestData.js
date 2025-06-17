// 最新の気温、水温、EC値、水位を取得するAPI
// このAPIは、最新のセンサーデータを取得し、EC値の補正も行います。
// 取得したデータは、フロントエンドで表示するために使用されます。
// // 注意: このAPIは、センサーデータが正しく登録されていることを前提としています。
// // センサーデータがない場合、nullが返されます。
// // また、EC値の補正には、最新の水温データが必要です。
// // そのため、水温センサーが正しく動作していることも前提としています。


const express = require('express');
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));


const router = express.Router();

router.get('/', async (req, res) => {
  // console.log('✅ /api/latest にアクセスされた！');
  try {
    const airRes = await db.query(`
      SELECT r.temperature, r.timestamp
      FROM sensor_raw_data r
      JOIN sensor_master m ON r.serial_number = m.serial_number
      WHERE m.sensor_type = 'air'
      ORDER BY r.timestamp DESC
      LIMIT 1
    `);

    const waterRes = await db.query(`
      SELECT r.temperature
      FROM sensor_raw_data r
      JOIN sensor_master m ON r.serial_number = m.serial_number
      WHERE m.sensor_type = 'water'
      ORDER BY r.timestamp DESC
      LIMIT 1
    `);

    const ecRes = await db.query(`
      SELECT ec_raw,
      calculate_ec_corrected(ec_raw,
        (SELECT temperature FROM sensor_raw_data 
         WHERE serial_number
         = (SELECT serial_number 
            FROM sensor_master 
            WHERE sensor_type = 'water') ORDER BY timestamp DESC LIMIT 1),
            wm.serial_number) as ec25_corrected
      FROM sensor_raw_data
      JOIN LATERAL ( SELECT sensor_master.serial_number
           FROM sensor_master
          WHERE sensor_master.sensor_type = 'water'::text
          ORDER BY sensor_master.serial_number DESC
         LIMIT 1) wm ON true
      WHERE ec_raw IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const waterLevelRes = await db.query(`
      SELECT water_level
      FROM water_sensor
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    const k1Res = await db.query(`
      SELECT k1, vin, r1, ra, temp_coefficient
      FROM ec_conversion_constants
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const modelRes = await db.query(`
      SELECT model_type, a, b, c
      FROM ec25_correction_model
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const ecAnalog = ecRes.rows[0]?.ec_raw ?? null;
    const ec25_corrected = ecRes.rows[0]?.ec25_corrected ?? null;
    const waterTemp = waterRes.rows[0]?.temperature ?? null;
    const k1Row = k1Res.rows[0];
    const model = modelRes.rows[0];

    res.status(200).json({
      timestamp: airRes.rows[0]?.timestamp ?? null,
      temperature: airRes.rows[0]?.temperature ?? null,
      water_temperature: waterRes.rows[0]?.temperature ?? null,
      ec: ecAnalog,
      water_level: waterLevelRes.rows[0]?.water_level ?? null,
      ec25_corrected,
    });

  } catch (error) {
    console.error('🔥 /api/latest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
