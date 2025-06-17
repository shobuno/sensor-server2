// apps/hydro-sense/backend/routes/index.js

const express = require('express');
const router = express.Router();

// 各ルートモジュールを読み込み（backend/routes 内に統一）
const latestData = require('./latestData');
const ecGraph = require('./ecGraph');
const sensorInfo = require('./sensorInfo');
const sensor = require('./sensor');
const waterLevel = require('./waterLevel');
const sensorInfoRouter = require('./sensorInfo');
const calculateEcCorrectedRouter = require('./calculateEcCorrected');
const calculateK1Router = require('./calculateK1');
const registerEcLogRouter = require('./registerEcLog');


// エンドポイントとルーターの紐付け
router.use('/latest', latestData);
router.use('/ec-graph', ecGraph);
router.use('/sensor-info', sensorInfo);
router.use('/sensor', sensor);           // ✅ センサーデータ受信
router.use('/water-level', waterLevel);  // ✅ 水位データ受信
router.use('/', sensorInfoRouter); // /api/sensor-serials や /api/latest-hourly-avg にマッチさせる
router.use('/calculate-ec-corrected', calculateEcCorrectedRouter);
router.use('/calculate-k1', calculateK1Router);
router.use('/register-ec-log', registerEcLogRouter);

module.exports = router;
