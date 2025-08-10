// sensor-server/apps/AutoMesh/backend/routes/ledBrightness.js

const express = require('express');
const router = express.Router();

// WS送信ヘルパは環境により名前が違うことがあるため、どれかにフォールバック
const ws = require('../ws/automesh-command');
const send =
  ws.sendCommandToDevice ||
  ws.sendTo ||
  ws.sendCommand ||
  ((serial, payload) => {
    console.error('[ledBrightness] WS sender not found');
  });

// 認証が必要なら auth を有効化してください
// const auth = require('../config/authMiddleware');

router.post('/', /*auth,*/ (req, res) => {
  const { serial_number, level, relay_index } = req.body || {};

  if (!serial_number || typeof level !== 'number') {
    return res.status(400).json({ error: 'serial_number と level(0..5) が必要です' });
  }
  if (level < 0 || level > 5) {
    return res.status(400).json({ error: 'level は 0..5 で指定してください' });
  }

  const payload = { type: 'set-led-brightness', level };
  if (relay_index !== undefined) payload.relay_index = relay_index; // 未来対応（今は全体で使用）

  console.log('[HTTP /led-brightness] →', serial_number, payload);
  try {
    send(serial_number, payload);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[HTTP /led-brightness] send error:', e);
    return res.status(500).json({ error: '送信に失敗しました' });
  }
});

module.exports = router;
