// scripts/reaggregate.js
const db = require("../db.js");
const {
  aggregateAndInsert10mValue,
  aggregateAndInsertByInterval
} = require("../controllers/aggregateSensorData");

async function reaggregateAll() {
  try {
    // console.log("⚠️ 既存データを削除中...");
    await db.query("DELETE FROM sensor_10m_values");
    await db.query("DELETE FROM sensor_1h_values");
    await db.query("DELETE FROM sensor_daily_values");
    await db.query("DELETE FROM sensor_monthly_values");

    // rawデータの範囲を取得
    const result = await db.query("SELECT MIN(timestamp) AS min, MAX(timestamp) AS max FROM sensor_raw_data");
    const { min, max } = result.rows[0];
    if (!min || !max) {
      console.log("📭 データがありません");
      return;
    }

    const start = new Date(min);
    const end = new Date(max);

    // console.log(`⏳ 再集計開始: ${start.toISOString()} ～ ${end.toISOString()}`);

    for (let t = new Date(start); t <= end; t.setMinutes(t.getMinutes() + 10)) {
      await aggregateAndInsert10mValue(new Date(t));
    }

    for (let t = new Date(start); t <= end; t.setHours(t.getHours() + 1)) {
      await aggregateAndInsertByInterval("1h", "sensor_10m_values", "sensor_1h_values", new Date(t));
    }

    for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
      await aggregateAndInsertByInterval("daily", "sensor_1h_values", "sensor_daily_values", new Date(t));
    }

    for (let t = new Date(start); t <= end; t.setMonth(t.getMonth() + 1)) {
      await aggregateAndInsertByInterval("monthly", "sensor_daily_values", "sensor_monthly_values", new Date(t));
    }

    // console.log("✅ 再集計完了！");
  } catch (err) {
    console.error("🔥 再集計エラー:", err);
  } finally {
    db.end();
  }
}

reaggregateAll();
