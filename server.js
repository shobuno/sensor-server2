// sensor-server/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// -------- middlewares (最上段) --------
//app.use(morgan('combined'));  // ログ出力
app.use(cookieParser());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://hydrosense.shobuno.org',
    'http://192.168.0.2:5173',
    'http://localhost:5176',
    'http://192.168.0.2:5176',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// リクエストがぶら下がらないためのグローバル・タイムアウト（10秒）
app.use((req, res, next) => {
  const to = setTimeout(() => {
    if (!res.headersSent) {
      console.error('⏳ timeout:', req.method, req.originalUrl);
      res.status(504).json({ error: 'gateway-timeout' });
    }
  }, 10_000);
  res.on('finish', () => clearTimeout(to));
  next();
});

// 識別と疎通
app.get('/healthz', (_req, res) => res.type('text').send('ok'));
app.get('/__whoami', (_req, res) => {
  res.json({ role: 'gateway', pid: process.pid, cwd: process.cwd(), time: new Date().toISOString() });
});

// === 一時対応：装置からのログ受信（先に置く） ===
app.post('/api/error-log', (req, res) => {
  const { error, token } = req.body || {};
  console.log('📡 Error Report from Device:', { error, token });
  res.sendStatus(200);
});

// -------- API ルーティング（※ 静的配信より前！） --------

// 認証関連
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/email', require('./backend/routes/emailVerification'));

// 管理者API（保護）
app.use('/api/admin', requireAuth(['admin']), require('./backend/routes/admin'));
app.use('/api/admin/users', requireAuth(['admin']), require('./backend/routes/adminUsers'));

// AutoMesh API（保護）
const autoMeshApp = require('./apps/AutoMesh/backend/app');
// 認証必須（必要ならロールを渡す）
app.use('/automesh/api', requireAuth(), autoMeshApp);
// 例: app.use('/automesh/api', requireAuth(['admin','automesh_user']), autoMeshApp);

// Todo API（保護）
const todoApp = require('./apps/todo/backend/app');
app.use('/api/todo', requireAuth(['todo_admin','todo_user','admin']), todoApp);

// HydroSense API
// ⚠️ 重要：Hydro 側の routes/index.js は内部で '/hydro/...' を付けています。
// そのため、ここは '/api' にマウントします（以前の '/api/hydro' だと二重になり 404/ぶら下がりの原因）。
const hydroRoutes = require('./apps/hydro-sense/backend/routes');
const ecGraph = require('./apps/hydro-sense/backend/routes/ecGraph');
app.use('/api', requireAuth(), hydroRoutes);
// チェック用
app.use('/api/ec-graph', (req, res, next) => {
  console.warn('LEGACY /api/ec-graph HIT', {
    referer: req.headers.referer,
    ua: req.headers['user-agent']
  });
  next();
}, requireAuth(), ecGraph);

app.use('/api/ec-graph', requireAuth(), ecGraph);


// 疎通テスト用（任意）：保護なしで生存確認できる軽いエンドポイント
app.get('/api/hydro/ping', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// API not found guard（fallback直前）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// -------- 静的配信（APIの後） --------
const distDir = path.join(__dirname, 'frontend/dist');
app.use(express.static(distDir));
app.use('/hydro-sense', express.static(distDir));

// React Router fallback（最後に一括で拾う）
app.get(/^\/hydro-sense(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// -------- WebSocket --------
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

// -------- 定期処理 --------
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

// -------- 起動 --------
server.listen(port, () => {
  console.log(`🚀 本番サーバ起動: http://localhost:${port}`);
});
