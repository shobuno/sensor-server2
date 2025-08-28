// sensor-server/apps/todo/backend/app.js
// apps/todo/backend/app.js（任意）
const express = require('express');
const router = express.Router();

router.use('/', require('./routes/todo'));
router.get('/_ping', (_req, res) => res.json({ ok: true, from: 'todo-app' }));
router.get('/healthz', (_req, res) => res.json({ ok: true, app: 'todo' }));

module.exports = router;

