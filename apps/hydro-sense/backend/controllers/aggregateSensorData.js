// controllers/aggregateSensorData.js
const path = require('path'); 
const db = require(path.resolve(__dirname, '../config/db'));

function getRangeStart(date, unit) {
  const d = new Date(date);
  if (unit === "10m") {
    d.setMinutes(Math.floor(d.getMinutes() / 10) * 10, 0, 0);
  } else if (unit === "1h") {
    d.setMinutes(0, 0, 0);
  } else if (unit === "daily") {
    d.setHours(0, 0, 0, 0);
  } else if (unit === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    throw new Error(`Unsupported unit: ${unit}`);
  }
  return d;
}

async function aggregateAndInsert10mValue(now) {
  const start = getRangeStart(new Date(now.getTime() - 10 * 60 * 1000), "10m");
  const end = new Date(start.getTime() + 10 * 60 * 1000);

  const exists = await db.query("SELECT 1 FROM sensor_10m_values WHERE timestamp = $1 LIMIT 1", [start]);
  if (exists.rows.length > 0) return;

  const temps = await db.query(`
    SELECT m.sensor_type, AVG(r.temperature) AS avg, MAX(r.temperature) AS max, MIN(r.temperature) AS min
    FROM sensor_raw_data r
    JOIN sensor_master m ON r.serial_number = m.serial_number
    WHERE r.timestamp >= $1 AND r.timestamp < $2
    GROUP BY m.sensor_type
  `, [start, end]);

  if (temps.rows.length === 0) return;

  let air = { avg: null, max: null, min: null };
  let water = { avg: null, max: null, min: null };
  for (const row of temps.rows) {
    if (row.sensor_type === "air") air = row;
    if (row.sensor_type === "water") water = row;
  }

  // 修正：補正済みECではなくrawのec_rawを使用
  const ec = await db.query(`
    SELECT AVG(r.ec_raw) AS avg, MAX(r.ec_raw) AS max, MIN(r.ec_raw) AS min
    FROM sensor_raw_data r
    JOIN sensor_master m ON r.serial_number = m.serial_number
    WHERE r.timestamp >= $1 AND r.timestamp < $2
      AND m.sensor_type = 'water'
      AND r.ec_raw IS NOT NULL
  `, [start, end]);

  const waterLevel = await db.query(`
    SELECT AVG(water_level) AS avg
    FROM water_sensor
    WHERE timestamp >= $1 AND timestamp < $2
  `, [start, end]);

  const allNull = [
    air.avg, air.max, air.min,
    water.avg, water.max, water.min,
    ec.rows[0].avg, ec.rows[0].max, ec.rows[0].min,
    waterLevel.rows[0].avg
  ].every(v => v === null);
  if (allNull) return;

  await db.query(`
    INSERT INTO sensor_10m_values (
      timestamp, air_avg, air_max, air_min,
      water_avg, water_max, water_min,
      ec_avg, ec_max, ec_min,
      water_level_avg
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    start,
    air.avg, air.max, air.min,
    water.avg, water.max, water.min,
    ec.rows[0].avg, ec.rows[0].max, ec.rows[0].min,
    waterLevel.rows[0].avg
  ]);
}

async function aggregateAndInsertByInterval(unit, sourceTable, targetTable, now) {
  const start = getRangeStart(now, unit);
  let rangeStart;
  if (unit === "1h") {
    rangeStart = new Date(start.getTime() - 60 * 60 * 1000);
  } else if (unit === "daily") {
    rangeStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  } else if (unit === "monthly") {
    const d = new Date(start);
    d.setMonth(d.getMonth() - 1);
    rangeStart = d;
  } else {
    throw new Error(`Unsupported unit: ${unit}`);
  }

  const exists = await db.query(`SELECT 1 FROM ${targetTable} WHERE timestamp = $1 LIMIT 1`, [rangeStart]);
  if (exists.rows.length > 0) return;

  const data = await db.query(`
    SELECT
      AVG(air_avg) AS air_avg, MAX(air_max) AS air_max, MIN(air_min) AS air_min,
      AVG(water_avg) AS water_avg, MAX(water_max) AS water_max, MIN(water_min) AS water_min,
      AVG(ec_avg) AS ec_avg, MAX(ec_max) AS ec_max, MIN(ec_min) AS ec_min,
      AVG(water_level_avg) AS water_level_avg
    FROM ${sourceTable}
    WHERE timestamp >= $1 AND timestamp < $2
  `, [rangeStart, start]);

  const row = data.rows[0];
  const allNull = Object.values(row).every(v => v === null);
  if (allNull) return;

  await db.query(`
    INSERT INTO ${targetTable} (
      timestamp, air_avg, air_max, air_min,
      water_avg, water_max, water_min,
      ec_avg, ec_max, ec_min,
      water_level_avg
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    rangeStart,
    row.air_avg, row.air_max, row.air_min,
    row.water_avg, row.water_max, row.water_min,
    row.ec_avg, row.ec_max, row.ec_min,
    row.water_level_avg
  ]);
}

module.exports = {
  aggregateAndInsert10mValue,
  aggregateAndInsertByInterval
};
