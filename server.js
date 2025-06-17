// sensor-server/server.js （sensor-server-new からリネーム済み想定）

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3000;  // ✅ 本番は 3000

// ✅ CORS設定
app.use(cors({
  origin: [
    'http://localhost:3000',           // 本番構成
    'https://hydrosense.shobuno.org',  // 外部アクセス
    'http://192.168.0.2:5173',          // 開発中のVite用に一応残してOK
  ],
  credentials: true,
}));

app.use(express.json());

// ✅ 静的ファイル配信（Reactビルド済み）
app.use('/hydro-sense', express.static(path.join(__dirname, 'apps/hydro-sense/views/dist')));

// ✅ APIルーティング
const hydroRoutes = require('./apps/hydro-sense/backend/routes');
app.use('/api', hydroRoutes);

// ✅ SPA fallback
app.get(/^\/hydro-sense(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/hydro-sense/views/dist/index.html'));
});

// ✅ WebSocket設定
const setupHydroWS = require('./apps/hydro-sense/wsHandlers/ws');
wss.on('connection', (ws, req) => {
  setupHydroWS(ws);
});

// ✅ 起動
server.listen(port, () => {
  console.log(`🚀 本番サーバ起動: http://localhost:${port}`);
});

// ✅ ルートリダイレクト
app.get('/', (req, res) => {
  res.redirect('/hydro-sense');
});
