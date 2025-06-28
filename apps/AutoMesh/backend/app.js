// AutoMesh/backend/app.js

const express = require("express");

const path = require("path");
const cors = require('cors');
const app = express();

// ルート定義ファイルを読み込む

const registerDeviceRouter = require('./routes/registerDevice');
const getDevicesRouter = require('./routes/getDevices');
const entryDevicesRouter = require('./routes/entryDevices');
const deviceControlRouter = require('./routes/deviceControl');
const blinkLedRouter = require('./routes/blinkLed');
const editDeviceNameRouter = require('./routes/editDeviceName');
const deleteDeviceRouter = require('./routes/deleteDevice');
const connectionStatusRouter = require('./routes/connectionStatus');
const relayStatesRouter = require('./routes/relayStates');
const scheduleRouter = require('./routes/schedule');


app.use(cors());
app.use(express.json());

// 明示的に全ルートを登録
// 📌 Viteでビルドしたフロントエンド（AutoMesh）の静的ファイル公開
app.use("/auto-mesh", express.static(path.join(__dirname, "../frontend/dist")));

app.use('/register-device', registerDeviceRouter);
app.use('/get-devices', getDevicesRouter);
app.use('/entry-devices', entryDevicesRouter);
app.use('/device-control', deviceControlRouter);

app.use('/blink-led', blinkLedRouter);  // ← ✅ ここが重要

app.use('/edit-device-name', editDeviceNameRouter);
app.use('/unregister-device', deleteDeviceRouter);
app.use('/connection-status', connectionStatusRouter);
app.use('/relay-states', relayStatesRouter);
app.use('/schedule', scheduleRouter); 

// ヘルスチェック
app.get('/ping', (req, res) => {
  res.json({ message: 'AutoMesh API OK' });
});

app.post('/test-blink', (req, res) => {
  res.json({ message: '点滅テストOK' });
});


module.exports = app;
