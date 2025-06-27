// AutoMesh/backend/routes/relayStates.js

const express = require('express');
const router = express.Router();
const { getRelayStates } = require('../ws/automesh-command');

// GET /relay-states
router.get('/', (req, res) => {
  const states = getRelayStates();
  res.json(states);
});

module.exports = router;
