// sensor-server/backend/routes/auth/me.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../config/authMiddleware');

router.get('/', authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = router;
