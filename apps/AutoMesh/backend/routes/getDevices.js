// AutoMesh/backend/routes/getDevices.js
const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT serial_number, relay_index, name, role, registered_at
      FROM automesh.devices
      ORDER BY serial_number, relay_index
    `);

    // グループ化
    const grouped = {};
    result.rows.forEach(row => {
      const sn = row.serial_number;
      if (!grouped[sn]) grouped[sn] = [];
      grouped[sn].push({
        relay_index: row.relay_index,
        name: row.name,
        role: row.role,
        registered_at: row.registered_at
      });
    });

    // 整形して返す
    const response = Object.entries(grouped).map(([serial_number, devices]) => ({
      serial_number,
      devices
    }));

    res.json(response);
  } catch (err) {
    console.error('デバイス一覧取得エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

module.exports = router;
