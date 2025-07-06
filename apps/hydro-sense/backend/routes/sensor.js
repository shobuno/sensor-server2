// apps/hydro-sense/backend/routes/sensor.js

const express = require('express');
const router = express.Router();
const path = require('path'); 
const db = require(path.resolve(__dirname, '../config/db'));
const {
  aggregateAndInsert10mValue,
  aggregateAndInsertByInterval
} = require('../controllers/aggregateSensorData');

router.post('/', async (req, res) => {
  try {
    console.log('📥 登録データ内容:', {
      timestamp,
      sensor1,
      type1,
      sensor2,
      type2,
      ecAnalogValue
    });

    const { sensors, ecAnalogValue } = req.body;
    const timestamp = new Date();

    if (!Array.isArray(sensors) || typeof ecAnalogValue !== 'number') {
      console.warn('❌ 無効なペイロード形式:', req.body);
      return res.status(400).json({ error: 'Invalid payload format' });
    }

    if (sensors.length !== 2) {
      console.warn('❌ sensors の数が不足しています:', sensors);
      return res.status(400).json({ error: 'sensorsは2つのセンサー情報を含めてください' });
    }

    const [sensor1, sensor2] = sensors;

    // センサータイプを取得
    const result1 = await db.query(
      'SELECT sensor_type FROM sensor_master WHERE serial_number = $1',
      [sensor1.serial]
    );
    const result2 = await db.query(
      'SELECT sensor_type FROM sensor_master WHERE serial_number = $1',
      [sensor2.serial]
    );

    const type1 = result1.rows[0]?.sensor_type;
    const type2 = result2.rows[0]?.sensor_type;

    if (!type1 || !type2) {
      console.warn('❌ sensor_master に未登録のセンサーがあります:', {
        sensor1: sensor1.serial, type1,
        sensor2: sensor2.serial, type2
      });
      return res.status(400).json({ error: 'sensor_master に未登録のセンサーがあります' });
    }

    // EC値が異常値であればスキップ
    if (ecAnalogValue > 3000) {
      console.warn('❌ ecAnalogValue が異常値:', ecAnalogValue);
      return res.status(400).json({ error: 'ecAnalogValueが異常のため、登録をスキップします' });
    }

    // 正しいsensor_typeに応じてec_rawを付与（もう一方はNULL）
    if (type1 === 'water' && type2 === 'air') {
      await db.query(
        `INSERT INTO sensor_raw_data
          (timestamp, serial_number, temperature, sensor_type, ec_raw)
         VALUES
          ($1, $2, $3, $4, $5),
          ($1, $6, $7, $8, NULL)`,
        [
          timestamp,
          sensor1.serial,
          sensor1.value,
          type1,
          ecAnalogValue,
          sensor2.serial,
          sensor2.value,
          type2
        ]
      );
    } else if (type1 === 'air' && type2 === 'water') {
      await db.query(
        `INSERT INTO sensor_raw_data
          (timestamp, serial_number, temperature, sensor_type, ec_raw)
         VALUES
          ($1, $2, $3, $4, NULL),
          ($1, $6, $7, $8, $5)`,
        [
          timestamp,
          sensor1.serial,
          sensor1.value,
          type1,
          ecAnalogValue,
          sensor2.serial,
          sensor2.value,
          type2
        ]
      );
    } else {
      return res.status(400).json({ error: 'air/water のペアで送信してください' });
    }

    // ✅ 集計処理をすべて実行（10m → 1h → daily → monthly）
    await aggregateAndInsert10mValue(timestamp);
    await aggregateAndInsertByInterval("1h", "sensor_10m_values", "sensor_1h_values", timestamp);
    await aggregateAndInsertByInterval("daily", "sensor_1h_values", "sensor_daily_values", timestamp);
    await aggregateAndInsertByInterval("monthly", "sensor_daily_values", "sensor_monthly_values", timestamp);

    res.status(200).json({ message: 'Sensor data received and processed' });

  } catch (err) {
    console.error('🔥 /api/sensor POST error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
