// AutoMesh/backend/routes/blinkLed.js （正しいパス想定）

const express = require('express');
const router = express.Router();
const { sendCommandToDevice } = require('../ws/automesh-command');

router.post('/', (req, res) => {
  const { serial_number, relay_index } = req.body;

  if (!serial_number || relay_index === undefined) {
    return res.status(400).json({ message: 'serial_number と relay_index が必要です' });
  }

sendCommandToDevice(serial_number, {
  type: 'led-blink',
  relay_index: relay_index
});

  res.json({ message: '点滅コマンドを送信しました' });
});

module.exports = router;
