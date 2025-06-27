// AutoMesh/backend/routes/editDeviceName.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.put('/', async (req, res) => {
  const { serial_number, relay_index, new_name } = req.body;

  if (!serial_number || relay_index === undefined || !new_name) {
    return res.status(400).json({ message: 'serial_number, relay_index, new_name は必須です' });
  }

  try {
    const result = await db.query(
      `UPDATE automesh.devices SET name = $1
       WHERE serial_number = $2 AND relay_index = $3`,
      [new_name, serial_number, relay_index]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: '対象デバイスが見つかりません' });
    }

    res.json({ message: 'デバイス名を更新しました' });
  } catch (err) {
    console.error('デバイス名更新エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

module.exports = router;
