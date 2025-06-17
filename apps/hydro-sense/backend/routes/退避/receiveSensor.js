// routes/receiveSensor.js
const express = require("express");
const router = express.Router();
const { saveAndAggregateSensorData } = require("../controllers/saveAndAggregateSensorData.js");

router.post("/sensor", saveAndAggregateSensorData);

module.exports = router;
