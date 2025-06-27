// AutoMesh/backend/routes/registerDevice.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));
const { notifyDeviceRegistered } = require('../ws/automesh-entry');

router.post('/', async (req, res) => {
  const { serial_number, name, role } = req.body;

  // relay_indexは省略し、ここで一括2件登録
  if (!serial_number || !name) {
    return res.status(400).json({ message: 'serial_number, name は必須です' });
  }

  try {
    const relayCount = 2; // 今は2リレー構成前提（将来設定で変えるならここ）

    for (let i = 0; i < relayCount; i++) {
      const relay_index = i;
      const deviceName = `${name}-${i + 1}`; // スイッチ-1, スイッチ-2 など

      const check = await db.query(
        'SELECT 1 FROM automesh.devices WHERE serial_number = $1 AND relay_index = $2',
        [serial_number, relay_index]
      );
      if (check.rowCount > 0) {
        console.warn(`⚠️ デバイス ${serial_number} (relay_index=${relay_index}) は既に登録済み`);
        continue; // 既に登録されているものはスキップ
      }

      await db.query(
        `INSERT INTO automesh.devices (serial_number, relay_index, name, role)
         VALUES ($1, $2, $3, $4)`,
        [serial_number, relay_index, deviceName, role || 'relay']
      );
    }

    // 登録通知（装置単位で1回でOK）
    notifyDeviceRegistered(serial_number, name);

    res.json({ message: 'デバイスを一括登録しました' });
  } catch (err) {
    console.error('登録エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

module.exports = router;
