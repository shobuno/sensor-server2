const path = require('path'); 
const db = require(path.resolve(__dirname, '../config/db'));

const DELETE_RULES = {
  sensor_raw_data: "now() - interval '2 days'",
  sensor_10m_values: "now() - interval '2 days'",
  sensor_1h_values: "now() - interval '2 months'",
  sensor_daily_values: "now() - interval '3 years'",
  water_sensor: "now() - interval '2 months'",
  water_daily_values: "current_date - interval '3 years'"
};

async function deleteOldData() {
  try {
    for (const [table, condition] of Object.entries(DELETE_RULES)) {
      const column = table === 'water_daily_values' ? 'date' : 'timestamp';
      const res = await db.query(
        `DELETE FROM ${table} WHERE ${column} < ${condition}`
      );
      console.log(`🧹 ${table}: ${res.rowCount} 件削除`);
    }
  } catch (err) {
    console.error('🔥 古いデータ削除エラー:', err);
  }
}

module.exports = { deleteOldData };
