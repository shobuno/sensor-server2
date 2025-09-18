// sensor-server/apps/todo/backend/routes/todo/holidays.js

const express = require('express');
const router = express.Router();

// 依存なしで動かすために最低限のJP祝日データを返すAPI。
// 将来的に正確性を高めるなら npm: 'holiday-jp' を使う実装に差し替え可。
// ここでは 2025 年分を用意（振替休日も含む）。
const JP_2025 = [
  ["2025-01-01", "元日"],
  ["2025-01-13", "成人の日"],          // 1月第2月曜
  ["2025-02-11", "建国記念の日"],
  ["2025-02-23", "天皇誕生日"],
  ["2025-02-24", "振替休日"],
  ["2025-03-20", "春分の日"],
  ["2025-04-29", "昭和の日"],
  ["2025-05-03", "憲法記念日"],
  ["2025-05-04", "みどりの日"],
  ["2025-05-05", "こどもの日"],
  ["2025-05-06", "振替休日"],
  ["2025-07-21", "海の日"],           // 7月第3月曜
  ["2025-08-11", "山の日"],           // 2025は月曜
  ["2025-09-15", "敬老の日"],         // 9月第3月曜
  ["2025-09-23", "秋分の日"],
  ["2025-10-13", "スポーツの日"],     // 10月第2月曜
  ["2025-11-03", "文化の日"],
  ["2025-11-23", "勤労感謝の日"],
  ["2025-11-24", "振替休日"],
];

const DB = { "JP-2025": JP_2025 };
// 必要なら 2026 以降を増やす

router.get('/', async (req, res) => {
  try {
    const y = String(req.query.year || '').trim();
    const country = String(req.query.country || 'JP').toUpperCase();
    if (!/^\d{4}$/.test(y)) return res.status(400).json({ error: 'year=YYYY を指定してください' });

    const key = `${country}-${y}`;
    const arr = DB[key] || [];
    const out = arr.map(([date, name]) => ({ date, name, country }));

    res.json({ year: Number(y), country, holidays: out });
  } catch (e) {
    console.error('[holidays] error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
