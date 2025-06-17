// routes/sensor.js
const express = require('express');
const router = express.Router();
const { saveAndAggregateSensorData } = require('../controllers/saveAndAggregateSensorData');

// /sensor に POST でデータを受け取る
router.post('/', saveAndAggregateSensorData);

module.exports = router;
