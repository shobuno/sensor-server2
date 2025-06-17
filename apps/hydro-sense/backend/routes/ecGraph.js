// backend/routes/ecGraph.js
const express = require('express');
const router = express.Router();
const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

router.get('/', async (req, res) => {
  const { type, range } = req.query;
  
  // console.log("✅ /api/ec-graph accessed", req.query);  // ← 追加


  let view;
  let intervalCondition = "";

  switch (range) {
    case '1d':
      view = 'v_ec_corrected_10m';
      intervalCondition = "timestamp >= NOW() - INTERVAL '1 day'";
      break;
    case '1w':
      view = 'v_ec_corrected_1h';
      intervalCondition = "timestamp >= NOW() - INTERVAL '7 days'";
      break;
    case '1m':
      view = 'v_ec_corrected_1h';
      intervalCondition = "timestamp >= NOW() - INTERVAL '1 month'";
      break;
    case '6m':
      view = 'v_ec_corrected_daily';
      intervalCondition = "timestamp >= NOW() - INTERVAL '6 months'";
      break;
    case '1y':
      view = 'v_ec_corrected_daily';
      intervalCondition = "timestamp >= NOW() - INTERVAL '1 year'";
      break;
    case '2y':
      view = 'v_ec_corrected_monthly';
      intervalCondition = "timestamp >= NOW() - INTERVAL '2 years'";
      break;
    default:
      return res.status(400).json({ error: '無効なrange指定です' });
  }

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
