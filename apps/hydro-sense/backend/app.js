// sensor-server/apps/hydro-sense/backend/app.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const apiRouter = require('./routes');

const app = express();

// 到達ログ
app.use(morgan('combined'));

// CORS / JSON
app.use(cors({
  origin: ['http://localhost:5173','http://192.168.0.2:5173','https://hydrosense.shobuno.org'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// グローバル10秒タイムアウト（ぶら下がり防止＆犯人URLの可視化）
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


// API（静的配信より前に必ず置く）
app.use('/api', apiRouter);

// 最後は404
app.get('*', (_req, res) => res.status(404).type('text').send('not found'));

module.exports = app;
