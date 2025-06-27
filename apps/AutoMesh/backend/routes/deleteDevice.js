// AutoMesh/backend/routes/deleteDevice.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));
const { notifyCommandUnregistered } = require('../ws/automesh-command'); // ✅ 差し替え

router.delete('/:serial_number', async (req, res) => {
  const { serial_number } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM automesh.devices WHERE serial_number = $1',
      [serial_number]
    );

    notifyCommandUnregistered(serial_number); // ✅ 正しい通知関数を呼ぶ
    res.json({ message: '登録解除しました', deleted: result.rowCount });
  } catch (err) {
    console.error('登録解除エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

module.exports = router;

