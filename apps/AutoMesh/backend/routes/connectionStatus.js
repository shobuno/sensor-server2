// AutoMesh/backend/routes/connectionStatus.js

const express = require('express');
const router = express.Router();
const { getConnectedCommandSerials } = require('../ws/automesh-command');

router.get('/', (req, res) => {
  const serials = getConnectedCommandSerials(); // ['esp32-relay-01', ...]
  res.json(serials);
});

module.exports = router;
