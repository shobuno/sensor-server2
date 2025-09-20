// sensor-server/apps/todo/backend/routes/todo/holidays.js
const express = require('express');
const router = express.Router();

// シンプルなキャッシュ（メモリ）
const cache = new Map();
const CACHE_MS = 1000 * 60 * 60 * 24; // 1日

router.get('/', async (req, res) => {
  try {
    const y = String(req.query.year || '').trim();
    const country = String(req.query.country || 'JP').toUpperCase();
    if (!/^\d{4}$/.test(y)) {
      return res.status(400).json({ error: 'year=YYYY を指定してください' });
    }

    const cacheKey = `${country}-${y}`;
    const now = Date.now();
    if (cache.has(cacheKey)) {
      const { ts, data } = cache.get(cacheKey);
      if (now - ts < CACHE_MS) {
        return res.json(data);
      }
    }

    // holidays-jp API を利用
    // 例: https://holidays-jp.github.io/api/v1/date.json
    const apiUrl = `https://holidays-jp.github.io/api/v1/${y}/date.json`;
    const r = await fetch(apiUrl);
    if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
    const json = await r.json();

    const holidays = Object.entries(json).map(([date, name]) => ({
      date,
      name,
      country,
    }));

    const out = { year: Number(y), country, holidays };
    cache.set(cacheKey, { ts: now, data: out });
    res.json(out);
  } catch (e) {
    console.error('[holidays] error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
