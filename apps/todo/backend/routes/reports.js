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

/** YYYY-MM-DD に日数を足す（JST前提の単純加算） */
function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)); // UTCの15:00=JST 00:00 付近に置くことで日跨ぎの誤差を避ける
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** JSTの日付文字列 (YYYY-MM-DD) から 00:00 と 翌日00:00 の時刻を作る（24:00は使わない） */
function jstBounds(dateStr) {
  const start = `${dateStr}T00:00:00+09:00`;
  const next  = addDaysYmd(dateStr, 1);
  const end   = `${next}T00:00:00+09:00`;
  return { start, end };
}

/** 指定日の daily_report を取得（作成はしない） */
async function fetchDailyReportHead(userId, dateStr) {
  const { rows } = await db.query(
    `SELECT id, user_id, report_date, period_start_at, period_end_at, created_at, updated_at, summary
       FROM todo.daily_reports
      WHERE user_id = $1 AND report_date = $2::date
      LIMIT 1`,
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
    const key = Number(r.item_id);
    const arr = map.get(key) || [];
    arr.push({ start_at: r.start_at, end_at: r.end_at });
    map.set(key, arr);
  }
  return map;
}

/** v1.5仕様：日別レポート（ヘッダ+明細）を構築（ライブ集計用：フォールバック） */
async function buildDailyReport(userId, dateStr, { withSessions = false } = {}) {
  const head = await fetchDailyReportHead(userId, dateStr);

  let startTs, endTs, useLinkedItemsOnly;
  if (head) {
    startTs = head.period_start_at;
    endTs   = head.period_end_at || new Date(); // JS Date は pg が timestamptz に変換
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
        ? Math.max(0, Math.round((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000))
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
      sessions: withSessions ? (sessMap.get(Number(i.id)) || []) : undefined,
    };
  });

  const totalSpent = items.reduce((a, r) => a + (r.spent_minutes || 0), 0);
  const completed  = items.filter(r => r.status === 'DONE').length;
  const paused     = items.filter(r => r.status === 'PAUSED').length;

  return {
    header: {
      date: dateStr,
      title: '日報（ライブ）',
      memo: head?.summary?.memo ?? '',
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

/** スナップショット（daily_report_items）で返す：保存済み日報優先 */
async function buildDailyReportFromSnapshot(userId, dateStr, { withSessions = false } = {}) {
  // ヘッダ取得（id, period, memo）
  const { rows: drRows } = await db.query(
    `SELECT dr.id, dr.user_id, dr.report_date,
            dr.period_start_at, dr.period_end_at, dr.summary,
            to_char(dr.report_date,'YYYY-MM-DD') AS ymd
       FROM todo.daily_reports dr
      WHERE dr.user_id=$1 AND dr.report_date=$2::date
      LIMIT 1`,
    [userId, dateStr]
  );
  const head = drRows[0];
  if (!head) return null;

  // 明細（sessions は withSessions=1 の時のみ返す）
  const { rows: rowsDri } = await db.query(
  `SELECT
      id, report_id, item_id, title, status,
      planned_minutes, spent_minutes, remaining_amount, remaining_unit,
      tags, note, sort_order,
      CASE WHEN $2::boolean THEN sessions ELSE '[]'::jsonb END AS sessions
  FROM todo.daily_report_items
  WHERE report_id = $1
  ORDER BY COALESCE(sort_order, 2147483647), id`,
  [head.id, (withSessions === true)]   // ← 第2引数は boolean。userId は渡さない
  );


  // pg の text[] が文字列で来る環境への保険
  const toTags = (t) => {
    if (Array.isArray(t)) return t;
    if (t == null) return [];
    if (typeof t === 'string') {
      const s = t.replace(/^\{|\}$/g, '');
      if (!s) return [];
      return s.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  };

  const items = rowsDri.map(r => ({
    id: r.item_id,                     // 既存UI互換：id は item_id
    title: r.title,
    status: String(r.status),
    category: null,                    // スナップショットには持たないため null
    remaining_unit: r.remaining_unit,
    remaining_amount: r.remaining_amount,
    planned_minutes: r.planned_minutes,
    spent_minutes: r.spent_minutes,
    plan_start_at: null,               // スナップショットでは不要
    plan_end_at:   null,
    tags: toTags(r.tags),
    sessions: withSessions ? r.sessions : undefined,
    note: r.note ?? null,
  }));

  const totalSpent = items.reduce((a, x) => a + (x.spent_minutes || 0), 0);
  const completed  = items.filter(x => x.status === 'DONE').length;
  const paused     = items.filter(x => x.status === 'PAUSED').length;

  return {
    header: {
      id: head.id,
      date: head.ymd,
      title: '日報',
      memo: head?.summary?.memo ?? '',
      summary: {
        total_spent_min: totalSpent,
        completed,
        paused,
        total: items.length
      },
      period_start_at: head.period_start_at,
      period_end_at:   head.period_end_at
    },
    items
  };
}

// ===================== Routes =====================

/**
 * GET /todo/reports?date=YYYY-MM-DD[&with_sessions=1]
 * 1) 保存済みスナップショット（daily_report_items）を最優先で返す
 * 2) 無ければ従来のライブ集計でフォールバック
 */
router.get('/reports', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const raw = String(req.query.date ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'date is required' });
  const dateStr = toYmdJst(raw);
  if (!dateStr) return res.status(400).json({ error: 'bad date format; expect YYYY-MM-DD' });

  const withSessions = req.query.with_sessions === '1';

  try {
    // period_end_at が入っている日報だけ snapshot を優先
    const head = await fetchDailyReportHead(userId, dateStr);
    const preferSnapshot = !!(head && head.period_end_at);
    if (preferSnapshot) {
      const snap = await buildDailyReportFromSnapshot(userId, dateStr, { withSessions });
      if (snap && Array.isArray(snap.items) && snap.items.length > 0) {
        return res.json(snap);
      }
      // スナップショットが空ならライブにフォールバック
    }


    const live = await buildDailyReport(userId, dateStr, { withSessions });
    return res.json(live);
  } catch (e) {
    console.error('GET /reports error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

// ... /reports/range, /reports/live は既存のまま ...
module.exports = router;
