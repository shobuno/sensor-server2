// apps/hydro-sense/backend/routes/index.js
const express = require('express');
const router = express.Router();

// 各ルートモジュール
const latestData = require('./latestData');
const ecGraph = require('./ecGraph');
const sensorInfo = require('./sensorInfo');
const sensor = require('./sensor');
const waterLevel = require('./waterLevel');
const calculateEcCorrectedRouter = require('./calculateEcCorrected');
const calculateK1Router = require('./calculateK1');
const registerEcLogRouter = require('./registerEcLog');

// ✅ /api/hydro/... に統一してマウント
//   子モジュール内は必ず `router.get('/')` / `router.post('/')` で受けること！
router.use('/hydro/latest', latestData);
router.use('/hydro/ec-graph', ecGraph);
router.use('/ec-graph', ecGraph);
router.use('/hydro', sensorInfo);
router.use('/hydro/sensor', sensor);
router.use('/hydro/water-level', waterLevel);
router.use('/hydro/calculate-ec-corrected', calculateEcCorrectedRouter);
router.use('/hydro/calculate-k1', calculateK1Router);
router.use('/hydro/register-ec-log', registerEcLogRouter);

module.exports = router;
