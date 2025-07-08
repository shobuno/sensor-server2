// backend/routes/ecGraph.js
const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.get('/', async (req, res) => {
  const { type, range, view: overrideView } = req.query;

  // 使用可能なビューキー（安全なバリデーション）
  const validViewKeys = ['10m', '1h', 'daily', 'monthly'];

  // range の妥当性チェック
  const validRanges = ['1d', '1w', '1m', '6m', '1y', '2y'];
  if (!validRanges.includes(range)) {
    return res.status(400).json({ error: '無効なrange指定です' });
  }

  // 🔧 表示ビューの決定（view 指定がなければ range に応じてデフォルトを使う）
  const effectiveView = overrideView && validViewKeys.includes(overrideView)
    ? overrideView
    : (
        range === '1d' ? '10m' :
        (range === '1w' || range === '1m') ? '1h' :
        (range === '6m' || range === '1y') ? 'daily' :
        'monthly'
      );

  const view = `v_ec_corrected_${effectiveView}`;

  // 🔧 intervalCondition はビューの粒度に応じて調整
  function getIntervalByView(viewKey, rangeKey) {
    if (viewKey === '10m') {
      if (rangeKey === '1d') return "NOW() - INTERVAL '1 day'";
      if (rangeKey === '1w') return "NOW() - INTERVAL '7 days'";
    }
    if (viewKey === '1h') {
      if (rangeKey === '1d') return "NOW() - INTERVAL '2 days'";
      if (rangeKey === '1w') return "NOW() - INTERVAL '10 days'";
      if (rangeKey === '1m') return "NOW() - INTERVAL '1 month'";
    }
    if (viewKey === 'daily') {
      return "NOW() - INTERVAL '2 months'";
    }
    if (viewKey === 'monthly') {
      return "NOW() - INTERVAL '2 years'";
    }
    return "NOW() - INTERVAL '1 day'"; // fallback
  }

  const intervalCondition = `timestamp >= ${getIntervalByView(effectiveView, range)}`;

  const query = `
    SELECT *
    FROM ${view}
    WHERE ${intervalCondition}
    ORDER BY timestamp
  `;

  try {
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('DBエラー:', err);
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

module.exports = router;
