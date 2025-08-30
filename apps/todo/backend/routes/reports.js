// sensor-server/apps/todo/backend/routes/reports.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

// ===================== Common helpers =====================

// JWTのどのキーにUUIDが入っていても拾えるように
function getUserId(req) {
  return req?.user?.id || req?.user?.id_uuid;
}

/** 任意入力を JST の YYYY-MM-DD に正規化 */
function formatYmdJst(date) {
  const tzOffMin = date.getTimezoneOffset(); // 現地→UTCの分
  const jst = new Date(date.getTime() + (9 * 60 + tzOffMin) * 60000);
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, '0');
  const d = String(jst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toYmdJst(input) {
  if (input == null) return null;
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : formatYmdJst(d);
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : formatYmdJst(d);
  }
  return null;
}

/** JSTの日付文字列 (YYYY-MM-DD) から 00:00 と 24:00 の時刻を作る */
function jstBounds(dateStr) {
  const start = `${dateStr}T00:00:00+09:00`;
  const end   = `${dateStr}T24:00:00+09:00`;
  return { start, end };
}

/** 指定日の daily_report を取得（作成はしない） */
async function fetchDailyReportHead(userId, dateStr) {
  const { rows } = await db.query(
    `SELECT id, user_id, report_date, period_start_at, period_end_at, created_at, updated_at
       FROM todo.daily_reports
      WHERE user_id = $1 AND report_date = $2::date`,
    [userId, dateStr]
  );
  return rows[0] || null;
}

/** 指定の期間に重なるセッション時間（分）を item_id ごとに集計 */
async function sumSessionsByItemWithin(userId, startTs, endTs) {
  const { rows } = await db.query(
    `
    WITH bounds AS (
      SELECT $2::timestamptz AS day_start, $3::timestamptz AS day_end
    )
    SELECT
      s.item_id,
      COALESCE(
        SUM(
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              LEAST(COALESCE(s.end_at, NOW()), b.day_end)
            - GREATEST(s.start_at, b.day_start)
            ))
          )
        ) / 60.0
      ,0) AS spent_min
    FROM todo.sessions s
    CROSS JOIN bounds b
    WHERE s.user_id = $1
      AND s.start_at < b.day_end
      AND COALESCE(s.end_at, NOW()) > b.day_start
    GROUP BY s.item_id
    `,
    [userId, startTs, endTs]
  );
  return new Map(rows.map(r => [Number(r.item_id), Number(r.spent_min || 0)]));
}

/** 指定日の item ごとのセッションを返す */
async function fetchSessionsByItem(userId, dateStr) {
  const { start, end } = jstBounds(dateStr);
  const { rows } = await db.query(
    `
    SELECT s.item_id, s.start_at, s.end_at
      FROM todo.sessions s
     WHERE s.user_id = $1
       AND s.start_at < $3
       AND COALESCE(s.end_at, NOW()) > $2
     ORDER BY s.start_at ASC
    `,
    [userId, start, end]
  );
  const map = new Map();
  for (const r of rows) {
    const arr = map.get(r.item_id) || [];
    arr.push({ start_at: r.start_at, end_at: r.end_at });
    map.set(r.item_id, arr);
  }
  return map;
}

/** v1.5仕様：日別レポート（ヘッダ+明細）を構築 */
async function buildDailyReport(userId, dateStr, { withSessions = false } = {}) {
  const head = await fetchDailyReportHead(userId, dateStr);

  let startTs, endTs, useLinkedItemsOnly;
  if (head) {
    startTs = head.period_start_at;
    endTs   = head.period_end_at || new Date();
    useLinkedItemsOnly = true;
  } else {
    const b = jstBounds(dateStr);
    startTs = b.start;
    endTs   = b.end;
    useLinkedItemsOnly = false;
  }

  const spentMap = await sumSessionsByItemWithin(userId, startTs, endTs);

  let itemsRows;
  if (useLinkedItemsOnly) {
    itemsRows = (await db.query(
      `SELECT i.*
         FROM todo.items i
         JOIN todo.daily_reports dr ON dr.id = i.daily_report_id
        WHERE dr.user_id = $1 AND dr.report_date = $2::date
        ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id`,
      [userId, dateStr]
    )).rows;
  } else {
    const b = jstBounds(dateStr);
    itemsRows = (await db.query(
      `WITH bounds AS (
         SELECT $2::timestamptz AS day_start, $3::timestamptz AS day_end
       ),
       used AS (
         SELECT DISTINCT s.item_id
           FROM todo.sessions s
           CROSS JOIN bounds b
          WHERE s.user_id = $1
            AND s.start_at < b.day_end
            AND COALESCE(s.end_at, NOW()) > b.day_start
       )
       SELECT i.*
         FROM todo.items i
         JOIN used u ON u.item_id = i.id
        WHERE i.user_id = $1
        ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id`,
      [userId, b.start, b.end]
    )).rows;
  }

  let sessMap = null;
  if (withSessions) {
    sessMap = await fetchSessionsByItem(userId, dateStr);
  }

  const items = itemsRows.map(i => {
    const planned =
      i.plan_start_at && i.plan_end_at
        ? Number((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000)
        : null;
    const spent = Math.round(spentMap.get(Number(i.id)) || 0);
    const tags = !i.tags_text ? [] : String(i.tags_text).split(',').map(s => s.trim()).filter(Boolean);
    return {
      id: i.id,
      title: i.title,
      status: String(i.status),
      category: i.category,
      remaining_unit: i.unit,
      remaining_amount: i.remaining_amount,
      planned_minutes: planned,
      spent_minutes: spent,
     plan_start_at: i.plan_start_at,
     plan_end_at:   i.plan_end_at,
      tags,
      sessions: withSessions ? (sessMap.get(i.id) || []) : undefined,
    };
  });

  const totalSpent = items.reduce((a, r) => a + (r.spent_minutes || 0), 0);
  const completed  = items.filter(r => r.status === 'DONE').length;
  const paused     = items.filter(r => r.status === 'PAUSED').length;

  return {
    header: {
      date: dateStr,
      title: '日報',
      memo: '',
      summary: {
        total_spent_min: totalSpent,
        completed,
        paused,
        total: items.length,
      },
      period_start_at: head ? head.period_start_at : jstBounds(dateStr).start,
      period_end_at:   head ? head.period_end_at   : null,
    },
    items,
  };
}

// ===================== Routes =====================

/**
 * GET /api/todo/reports?date=YYYY-MM-DD[&with_sessions=1]
 */
router.get('/reports', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const raw = String(req.query.date ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'date is required' });
  const dateStr = toYmdJst(raw);
  if (!dateStr) return res.status(400).json({ error: 'bad date format; expect YYYY-MM-DD' });

  try {
    const payload = await buildDailyReport(userId, dateStr, {
      withSessions: req.query.with_sessions === '1'
    });
    res.json(payload);
  } catch (e) {
    console.error('GET /reports error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

// ... /reports/range, /reports/live は既存のまま ...
module.exports = router;
