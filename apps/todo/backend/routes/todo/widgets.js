// ssensor-server/apps/todo/backend/routes/todo/widgets.js

const express = require('express');
const router = express.Router();

// 10分キャッシュ
let cache = { key: '', at: 0, data: null };
const TTL_MS = 10 * 60 * 1000;

router.get('/weather', async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? 35.68); // 東京駅デフォルト
    const lon = Number(req.query.lon ?? 139.76);
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

    if (cache.key === key && Date.now() - cache.at < TTL_MS && cache.data) {
      return res.json(cache.data);
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`;
    const r = await fetch(url);
    const data = await r.json();

    cache = { key, at: Date.now(), data };
    res.json(data);
  } catch (e) {
    console.error('weather proxy error', e);
    res.status(500).json({ error: 'weather fetch failed' });
  }
});

module.exports = router;
