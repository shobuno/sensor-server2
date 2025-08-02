// sensor-server/backend/routes/auth/index.js

const express = require('express');
const router = express.Router();

router.use('/login', require('./login'));
router.use('/me', require('./me'));

module.exports = router;
