// scripts/migrateAggregates.js
const path = require("path");
const db = require("../db.js");
const {
  aggregateAndInsert10mValue,
  aggregateAndInsertByInterval,
} = require("../controllers/aggregateSensorData");

async function migrateAll() {
  // console.log("🚀 再集計開始");

  const start = new Date("2025-05-01T00:00:00+09:00");
  const now = new Date();

  // 10分単位
  for (
    let t = new Date(start);
    t <= now;
    t.setMinutes(t.getMinutes() + 10)
  ) {
    await aggregateAndInsert10mValue(new Date(t));
  }

  // 1時間単位
  for (
    let t = new Date(start);
    t <= now;
    t.setHours(t.getHours() + 1, 0, 0, 0)
  ) {
    await aggregateAndInsertByInterval(
      "1h",
      "sensor_10m_values",
      "sensor_1h_values",
      new Date(t)
    );
  }

  // 日単位
  for (
    let t = new Date(start);
    t <= now;
    t.setDate(t.getDate() + 1)
  ) {
    t.setHours(0, 0, 0, 0);
    await aggregateAndInsertByInterval(
      "daily",
      "sensor_1h_values",
      "sensor_daily_values",
      new Date(t)
    );
  }

  // 月単位
  for (
    let t = new Date(start);
    t <= now;
    t.setMonth(t.getMonth() + 1)
  ) {
    t.setDate(1);
    t.setHours(0, 0, 0, 0);
    await aggregateAndInsertByInterval(
      "monthly",
      "sensor_daily_values",
      "sensor_monthly_values",
      new Date(t)
    );
  }

  // console.log("✅ 再集計完了！");
}

migrateAll().catch((err) => {
  console.error("❌ 集計エラー:", err);
});
