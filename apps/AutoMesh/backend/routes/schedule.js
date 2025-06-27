// AutoMesh/backend/routes/schedule.js

const express = require("express");
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

// POST /automesh/schedule - スケジュール登録
router.post("/", async (req, res) => {
  try {
    const { serial_number, relay_index, weekdays, hour, minute, action, enabled } = req.body;

    if (!serial_number || typeof relay_index !== "number" || !Array.isArray(weekdays) ||
        typeof hour !== "number" || typeof minute !== "number" ||
        !["on", "off", "ON", "OFF"].includes(action)) {
      return res.status(400).json({ error: "不正な入力です" });
    }

    const result = await db.query(
      `INSERT INTO automesh.schedules
        (serial_number, relay_index, weekdays, hour, minute, action, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        serial_number,
        relay_index,
        weekdays,
        hour,
        minute,
        action.toLowerCase(),
        enabled ?? true
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ スケジュール登録失敗:", err);
    res.status(500).json({ error: "スケジュール登録エラー" });
  }
});

// GET /automesh/schedule - スケジュール一覧取得
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM automesh.schedules ORDER BY hour, minute, serial_number, relay_index`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ スケジュール取得失敗:", err);
    res.status(500).json({ error: "スケジュール取得エラー" });
  }
});

// PATCH /schedule/:id - enabledのON/OFF切替
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabledはbooleanである必要があります" });
  }

  try {
    const result = await db.query(
      `UPDATE automesh.schedules SET enabled = $1 WHERE id = $2 RETURNING *`,
      [enabled, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "対象のスケジュールが見つかりません" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ スケジュールenabled切替失敗:", err);
    res.status(500).json({ error: "スケジュール更新エラー" });
  }
});

// DELETE /schedule/:id - スケジュール削除
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM automesh.schedules WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "対象のスケジュールが見つかりません" });
    }

    res.json({ message: "削除成功", id });
  } catch (err) {
    console.error("❌ スケジュール削除失敗:", err);
    res.status(500).json({ error: "スケジュール削除エラー" });
  }
});


module.exports = router;
