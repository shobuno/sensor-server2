// sensor-server/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// === CORS設定 ===
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://hydrosense.shobuno.org',
    'http://192.168.0.2:5173',
  ],
  credentials: true,
}));

app.use(express.json());

// === Hydro Sense: 静的ファイルとAPI ===
app.use('/hydro-sense', express.static(path.join(__dirname, 'apps/hydro-sense/frontend/dist')));
const hydroRoutes = require('./apps/hydro-sense/backend/routes');
app.use('/api', hydroRoutes);

// === AutoMesh: API登録（静的配信はまだ未使用） ===
const autoMeshApp = require('./apps/AutoMesh/backend/app');

console.log('🧪 autoMeshApp の typeof:', typeof autoMeshApp);  // ← 

app.use('/automesh/api', autoMeshApp);

// === ルート表示 ===
const routes = autoMeshApp._router?.stack?.filter(r => r.route);
if (routes) {
  routes.forEach(r => {
    console.log('🛣️ 登録ルート:', Object.keys(r.route.methods)[0].toUpperCase(), r.route.path);
  });
}


// === AutoMesh: 静的配信追加 ===
app.use('/auto-mesh', express.static(path.join(__dirname, 'apps/AutoMesh/frontend/dist')));

// === AutoMesh: SPA fallback追加 ===
app.get(/^\/auto-mesh(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/AutoMesh/frontend/dist/index.html'));
});

// === SPA fallback（Hydro Sense）===
app.get(/^\/hydro-sense(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/hydro-sense/frontend/dist/index.html'));
});

// === WebSocket: Hydro Sense 用 ===
const setupHydroWS = require('./apps/hydro-sense/wsHandlers/ws');
const hydroWss = new WebSocket.Server({ noServer: true });

// === WebSocket: AutoMesh フロント用 ===
const setupAutoMeshWS = require('./apps/AutoMesh/backend/ws/automesh');
setupAutoMeshWS(server, (deviceList) => {
  console.log('🔄 AutoMeshデバイス更新:', deviceList);
});

// === WebSocket: AutoMesh ESP32 Entry用 ===
const { setupAutoMeshEntryWSS } = require('./apps/AutoMesh/backend/ws/automesh-entry');
setupAutoMeshEntryWSS(server);

// ✅ WebSocket: AutoMesh Command用（修正済み） ===
const { setupAutoMeshCommandWSS } = require('./apps/AutoMesh/backend/ws/automesh-command');
const commandWss = new WebSocket.Server({ noServer: true });
setupAutoMeshCommandWSS(commandWss);

// === WebSocket Upgrade Routing ===
server.on('upgrade', (req, socket, head) => {
  const { url } = req;

  if (url === '/ws/hydro') {
    hydroWss.handleUpgrade(req, socket, head, (ws) => {
      hydroWss.emit('connection', ws, req);
      setupHydroWS(ws);
    });
  } else if (url === '/automesh-entry' || url === '/ws/automesh') {
    // Entry や フロントの WebSocket は内部で handleUpgrade 済み
  } else if (url === '/automesh-command') {
    commandWss.handleUpgrade(req, socket, head, (ws) => {
      commandWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// === 起動 ===
server.listen(port, () => {
  console.log(`🚀 本番サーバ起動: http://localhost:${port}`);
});

// === ルートリダイレクト ===
app.get('/', (req, res) => {
  res.redirect('/hydro-sense');
});

// === 深夜2時の定期処理 ===
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

// === スケジュール実行処理（毎分） ===
const { runSchedules } = require('./apps/AutoMesh/backend/tasks/runSchedules');

cron.schedule('* * * * *', async () => {
  //console.log('⏰ スケジュール実行チェック');
  try {
    await runSchedules();
  } catch (err) {
    console.error('🔥 スケジュール実行エラー:', err);
  }
});




