// apps/AutoMesh/backend/routes/entryDevices.js
const express = require('express');
const router = express.Router();
const { getUnregisteredDevices } = require('../ws/automesh-entry');

router.get('/', (req, res) => {
  const list = getUnregisteredDevices();  // WebSocketで保持している未登録デバイス一覧
  res.json(list);
});

module.exports = router;
