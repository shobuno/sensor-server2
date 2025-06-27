// apps/AutoMesh/backend/routes/deviceControl.js
const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));
const { requestDeviceBlink } = require('../ws/automesh-entry');
const { notifyCommandUnregistered } = require('../ws/automesh-command');

router.post('/blink', (req, res) => {
  const { serial_number } = req.body;
  if (!serial_number) {
    return res.status(400).json({ message: 'serial_numberが必要です' });
  }

  requestDeviceBlink(serial_number);
  res.json({ message: '点滅指示を送信しました' });
});

router.post('/unregister', async (req, res) => {
  const { serial_number } = req.body;
  if (!serial_number) {
    return res.status(400).json({ message: 'serial_numberが必要です' });
  }

  try {
    await db.query(
      'DELETE FROM automesh.devices WHERE serial_number = $1',
      [serial_number]
    );

    notifyCommandUnregistered(serial_number);

    res.json({ message: '登録を解除しました' });
  } catch (err) {
    console.error('解除エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

const { sendCommandToDevice } = require('../ws/automesh-command'); // ← 追加（必須）

router.post('/', (req, res) => {
  const { serial_number, relay_index, on } = req.body;

  if (!serial_number || relay_index === undefined || typeof on !== 'boolean') {
    return res.status(400).json({ message: 'serial_number, relay_index, on は必須です' });
  }

  try {
    sendCommandToDevice(serial_number, {
      type: 'relay-toggle',
      relay_index,
      on
    });

    console.log(`💡 relay-toggle 送信: ${serial_number} → relay ${relay_index} = ${on}`);
    res.json({ message: 'リレー制御指示を送信しました' });
  } catch (err) {
    console.error('リレー制御エラー:', err);
    res.status(500).json({ message: 'サーバー内部エラー' });
  }
});

module.exports = router;
