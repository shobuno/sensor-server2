// AutoMesh/backend/tasks/runSchedules.js

const path = require("path");
const db = require(path.resolve(__dirname, "../config/db"));
const { sendRelayCommand } = require("../utils/sendRelayCommand");

/**
 * 現在時刻に一致するスケジュールを実行する
 * （毎分1回呼ばれることを想定）
 */
async function runSchedules() {
  const now = new Date();

  // 曜日マッピング（スケジュールは「月」「火」などの日本語）
  const dayOfWeekMap = ["日", "月", "火", "水", "木", "金", "土"];
  const currentWeekday = dayOfWeekMap[now.getDay()];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  try {
    const result = await db.query(`
      SELECT * FROM automesh.schedules
      WHERE enabled = true
    `);

    const matching = result.rows.filter((s) =>
      s.weekdays.includes(currentWeekday) &&
      s.hour === currentHour &&
      s.minute === currentMinute
    );

    if (matching.length === 0) {
      //console.log("⏱ 実行対象スケジュールなし");
      return;
    }

    console.log(`⚡ 実行対象スケジュール: ${matching.length} 件`);

    for (const s of matching) {
      const success = sendRelayCommand(s.serial_number, s.relay_index, s.action);
      if (!success) {
        console.warn(`❌ 実行失敗: ${s.serial_number} リレー${s.relay_index}`);
      }
    }
  } catch (err) {
    console.error("🔥 スケジュール実行中にエラー:", err);
  }
}

module.exports = { runSchedules };
