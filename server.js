// sensor-server/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://hydrosense.shobuno.org',
    'http://192.168.0.2:5173',
  ],
  credentials: true,
}));

app.use(express.json());

// === 一時対応 装置からのログを受信 ===
app.post('/api/error-log', (req, res) => {
  const { error, token } = req.body;
  console.log(`📡 Error Report from Device:`);
  console.log(`   errorCode: ${error}`);
  console.log(`   token: ${token}`);
  res.sendStatus(200);
});

// === 静的ファイル配信（統合ビルド dist）===
app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.use('/hydro-sense', express.static(path.join(__dirname, 'frontend/dist')));

app.get(/^\/hydro-sense(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});


// === APIルーティング ===

// 認証関連
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/email', require('./backend/routes/emailVerification'));

// 管理者API（保護）
app.use('/api/admin', requireAuth, require('./backend/routes/admin'));
app.use('/api/admin/users', requireAuth, require('./backend/routes/adminUsers'));

// HydroSense API（保護）
const hydroRoutes = require('./apps/hydro-sense/backend/routes');
app.use('/api', requireAuth, hydroRoutes);

// AutoMesh API（保護）
const autoMeshApp = require('./apps/AutoMesh/backend/app');
app.use('/automesh/api', requireAuth, autoMeshApp);

// === React Router fallback ===
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// === WebSocket設定 ===
const setupHydroWS = require('./apps/hydro-sense/wsHandlers/ws');
const hydroWss = new WebSocket.Server({ noServer: true });

const setupAutoMeshWS = require('./apps/AutoMesh/backend/ws/automesh');
setupAutoMeshWS(server, (deviceList) => {
  console.log('🔄 AutoMeshデバイス更新:', deviceList);
});

const { setupAutoMeshEntryWSS } = require('./apps/AutoMesh/backend/ws/automesh-entry');
setupAutoMeshEntryWSS(server);

const { setupAutoMeshCommandWSS } = require('./apps/AutoMesh/backend/ws/automesh-command');
const commandWss = new WebSocket.Server({ noServer: true });
setupAutoMeshCommandWSS(commandWss);

server.on('upgrade', (req, socket, head) => {
  const { url } = req;
  if (url === '/ws/hydro') {
    hydroWss.handleUpgrade(req, socket, head, (ws) => {
      hydroWss.emit('connection', ws, req);
      setupHydroWS(ws);
    });
  } else if (url === '/automesh-command') {
    commandWss.handleUpgrade(req, socket, head, (ws) => {
      commandWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// === 定期処理 ===
const { aggregateWaterDailyValues } = require('./apps/hydro-sense/backend/controllers/aggregateWaterDaily');
const { deleteOldData } = require('./apps/hydro-sense/backend/controllers/deleteOldData');

cron.schedule('0 2 * * *', async () => {
  console.log('🌙 深夜2時定期処理開始');
  try {
    await aggregateWaterDailyValues();
    await deleteOldData();
    console.log('✅ 深夜2時定期処理完了');
  } catch (err) {
    console.error('🔥 深夜定期処理中にエラー:', err);
  }
});

const { runSchedules } = require('./apps/AutoMesh/backend/tasks/runSchedules');

cron.schedule('* * * * *', async () => {
  try {
    await runSchedules();
  } catch (err) {
    console.error('🔥 スケジュール実行エラー:', err);
  }
});

// === 起動 ===
server.listen(port, () => {
  console.log(`🚀 本番サーバ起動: http://localhost:${port}`);
});