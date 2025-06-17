// aggregation_tasks.js - 1時間・日・月・年の自動集計関数

const pool = require('../db');

function startOfHour(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() - 1);
}
function startOfDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 1);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(date) {
  return new Date(date.getFullYear() - 1, 0, 1);
}

async function aggregatePeriod(from, to, targetTable, sourceTable) {
  const exists = await pool.query(
    `SELECT 1 FROM ${targetTable} WHERE timestamp = $1`, [from]
  );
  if (exists.rowCount > 0) return;

  const q = await pool.query(`
    SELECT
      AVG(avg_temp)::REAL as avg_temp,
      MAX(max_temp)::REAL as max_temp,
      MIN(min_temp)::REAL as min_temp,
      AVG(avg_water)::REAL as avg_water,
      MAX(max_water)::REAL as max_water,
      MIN(min_water)::REAL as min_water,
      AVG(avg_ec)::REAL as avg_ec,
      MAX(avg_ec)::REAL as max_ec,
      MIN(avg_ec)::REAL as min_ec
    FROM ${sourceTable}
    WHERE timestamp >= $1 AND timestamp <= $2
  `, [from, to]);

  const r = q.rows[0];
  if (r.avg_temp === null) return;

  await pool.query(`
    INSERT INTO ${targetTable} (
      timestamp, avg_temp, max_temp, min_temp,
      avg_water, max_water, min_water,
      avg_ec, max_ec, min_ec
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [
    from,
    r.avg_temp, r.max_temp, r.min_temp,
    r.avg_water, r.max_water, r.min_water,
    r.avg_ec, r.max_ec, r.min_ec
  ]);
}

async function aggregateHourly() {
  const now = new Date();
  const from = startOfHour(now);
  const to = new Date(from.getTime() + 59 * 60 * 1000 + 59 * 1000 + 999);
  await aggregatePeriod(from, to, 'sensor_hourly_values', 'sensor_10m_values');
}

async function aggregateDaily() {
  const now = new Date();
  const from = startOfDay(now);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  await aggregatePeriod(from, to, 'sensor_daily_values', 'sensor_hourly_values');
}

async function aggregateMonthly() {
  const now = new Date();
  const from = startOfMonth(now);
  const to = new Date(new Date(from.getFullYear(), from.getMonth() + 1, 1).getTime() - 1);
  await aggregatePeriod(from, to, 'sensor_monthly_values', 'sensor_daily_values');
}

async function aggregateYearly() {
  const now = new Date();
  const from = startOfYear(now);
  const to = new Date(new Date(from.getFullYear() + 1, 0, 1).getTime() - 1);
  await aggregatePeriod(from, to, 'sensor_yearly_values', 'sensor_monthly_values');
}

async function runAllAggregations() {
  await aggregateHourly();
  await aggregateDaily();
  await aggregateMonthly();
  await aggregateYearly();
  // console.log('[集計完了]');
}

module.exports = {
  runAllAggregations,
  aggregateHourly,
  aggregateDaily,
  aggregateMonthly,
  aggregateYearly,
};
