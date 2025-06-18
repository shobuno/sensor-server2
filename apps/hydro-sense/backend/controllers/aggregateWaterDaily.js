// hydoro-sense/backend/controllers/aggregateWaterDaily.js

const path = require('path'); 
const db = require(path.resolve(__dirname, '../config/db'));

async function aggregateWaterDailyValues(targetDate) {
  // 日付が指定されていなければ、1日前を対象にする（深夜2時の実行を想定）
  const date = targetDate ? new Date(targetDate) : new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);

  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);

  const query = `
    INSERT INTO water_daily_values (date, serial_number, level_avg, level_max, level_min)
    SELECT
      date_trunc('day', timestamp)::date AS date,
      serial_number,
      AVG(water_level)::float AS level_avg,
      MAX(water_level)::float AS level_max,
      MIN(water_level)::float AS level_min
    FROM water_sensor
    WHERE timestamp >= $1 AND timestamp < $2
    GROUP BY 1, 2
    ON CONFLICT (date, serial_number) DO UPDATE SET
      level_avg = EXCLUDED.level_avg,
      level_max = EXCLUDED.level_max,
      level_min = EXCLUDED.level_min
  `;

  try {
    const res = await db.query(query, [start, end]);
    console.log(`📘 water_daily_values: ${res.rowCount} 件を登録/更新しました (${start.toISOString().slice(0, 10)})`);
  } catch (err) {
    console.error('🔥 水位日次集計エラー:', err);
  }
}

module.exports = { aggregateWaterDailyValues };
