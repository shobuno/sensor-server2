// sensor-server/apps/todo/backend/routes/reports.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

// ===================== Common helpers =====================

// JWTのどのキーにUUIDが入っていても拾えるように
function getUserId(req) {
  return req?.user?.id || req?.user?.id_uuid;
}

/** 任意入力を JST の YYYY-MM-DD に正規化（"Fri Aug 29" 等も許容） */
function formatYmdJst(date) {
  // JS Date(ローカル) -> JSTに補正して YYYY-MM-DD
  const tzOffMin = date.getTimezoneOffset(); // 現地→UTCの分
  const jst = new Date(date.getTime() + (9 * 60 + tzOffMin) * 60000);
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, '0');
  const d = String(jst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toYmdJst(input) {
  if (typeof input === 'string') {
    // 許容: YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD
    const m = input.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // それ以外は Date.parse に委ねる
    const d = new Date(input);
    if (!isNaN(d)) return formatYmdJst(d);
  } else if (typeof input === 'number') {
    const d = new Date(input);
    if (!isNaN(d)) return formatYmdJst(d);
  }
  throw new Error('invalid date format');
}

/** JSTの日付文字列 (YYYY-MM-DD) から 00:00 と 24:00 の時刻(TZ=+09:00)を作る */
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

/** v1.5仕様：日別レポート（ヘッダ+明細）を構築 */
async function buildDailyReport(userId, dateStr) {
  // 1) レポートヘッダ取得
  const head = await fetchDailyReportHead(userId, dateStr);

  // 2) 集計期間を決定
  let startTs, endTs, useLinkedItemsOnly;
  if (head) {
    // daily_reportsの期間を採用
    startTs = head.period_start_at;
    endTs   = head.period_end_at || new Date(); // ← パラメータは実時刻に
    useLinkedItemsOnly = true; // その日報に紐づいた items を全件表示（0分でも）
  } else {
    // レポート未作成日は 00:00〜24:00 をプレビュー
    const b = jstBounds(dateStr);
    startTs = b.start;
    endTs   = b.end;
    useLinkedItemsOnly = false; // セッションがある item のみ
  }

  // 3) セッション集計（item_idごと）
  const spentMap = await sumSessionsByItemWithin(userId, startTs, endTs);

  // 4) 対象 items を取得
  let itemsRows;
  if (useLinkedItemsOnly) {
    itemsRows = (await db.query(
      `
      SELECT i.*
      FROM todo.items i
      JOIN todo.daily_reports dr ON dr.id = i.daily_report_id
      WHERE dr.user_id = $1 AND dr.report_date = $2::date
      ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
      `,
      [userId, dateStr]
    )).rows;
  } else {
    // レポートが無ければ、その日のセッションが1分でもある item を表示
    const b = jstBounds(dateStr);
    itemsRows = (await db.query(
      `
      WITH bounds AS (
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
      ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
      `,
      [userId, b.start, b.end]
    )).rows;
  }

  // 5) 明細の形に整形
  const items = itemsRows.map(i => {
    const planned =
      i.plan_start_at && i.plan_end_at
        ? Number((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000)
        : null;
    const spent = Math.round(spentMap.get(Number(i.id)) || 0);
    const tags =
      !i.tags_text || i.tags_text === '' ? [] : String(i.tags_text).split(',').map(s => s.trim()).filter(Boolean);
    return {
      id: i.id,
      title: i.title,
      status: String(i.status),
      category: i.category,
      remaining_unit: i.unit,
      remaining_amount: i.remaining_amount,
      planned_minutes: planned,
      spent_minutes: spent,
      tags,
    };
  });

  // 6) サマリ
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
 * GET /api/todo/reports?date=YYYY-MM-DD
 * 指定日のレポート（存在すれば daily_reports 期間、無ければ 00:00〜24:00 プレビュー）
 */
router.get('/reports', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const raw = req.query.date;
  if (!raw) return res.status(400).json({ error: 'date is required' });

  let dateStr;
  try {
    dateStr = toYmdJst(raw); // ★ 正規化（"Fri Aug 29" 等もOK）
  } catch {
    return res.status(400).json({ error: 'bad date format; expect YYYY-MM-DD' });
  }

  try {
    const payload = await buildDailyReport(userId, dateStr);
    res.json(payload);
  } catch (e) {
    console.error('GET /reports error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

/**
 * GET /api/todo/reports/range?from=&to=
 * 一覧用の日別サマリ
 * - spent は JST日付ごとの 00:00〜24:00 で計算
 * - 件数/完了数は、daily_reports が存在する日のみ items 紐付けから算出
 */
router.get('/reports/range', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  let { from, to } = req.query || {};
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  try {
    from = toYmdJst(from); // ★ 正規化
    to   = toYmdJst(to);   // ★ 正規化
  } catch {
    return res.status(400).json({ error: 'bad date format; expect YYYY-MM-DD' });
  }

  try {
    // 1) 各日ごとの spent_min（JST 00:00〜24:00 でのオーバーラップ合計）
    const { rows: spentRows } = await db.query(
      `
      WITH days AS (
        SELECT d::date AS d
        FROM generate_series($2::date, $3::date, interval '1 day') AS g(d)
      ),
      bounds AS (
        SELECT d,
               (d::text || 'T00:00:00+09:00')::timestamptz AS day_start,
               (d::text || 'T24:00:00+09:00')::timestamptz AS day_end
        FROM days
      ),
      per_day AS (
        SELECT b.d AS report_date,
               COALESCE(SUM(
                 GREATEST(0, EXTRACT(EPOCH FROM (
                   LEAST(COALESCE(s.end_at, NOW()), b.day_end)
                   - GREATEST(s.start_at, b.day_start)
                 )))
               ) / 60.0, 0) AS total_spent_min
        FROM bounds b
        LEFT JOIN todo.sessions s
          ON s.user_id = $1
         AND s.start_at < b.day_end
         AND COALESCE(s.end_at, NOW()) > b.day_start
        GROUP BY b.d
      )
      SELECT report_date, ROUND(total_spent_min)::int AS total_spent_min
      FROM per_day
      ORDER BY report_date DESC
      `,
      [userId, from, to]
    );

    // 2) daily_reports がある日の件数/完了数
    const { rows: countsRows } = await db.query(
      `
      SELECT dr.report_date,
             COUNT(i.id) AS total,
             COUNT(*) FILTER (WHERE i.status = 'DONE') AS done
      FROM todo.daily_reports dr
      LEFT JOIN todo.items i ON i.daily_report_id = dr.id AND i.user_id = dr.user_id
      WHERE dr.user_id = $1
        AND dr.report_date BETWEEN $2::date AND $3::date
      GROUP BY dr.report_date
      `,
      [userId, from, to]
    );
    const countMap = new Map(countsRows.map(r => [
      String(r.report_date),
      { total: Number(r.total || 0), done: Number(r.done || 0) },
    ]));

    // 3) マージして返す
    const payload = spentRows.map(r => {
      const key = String(r.report_date);
      const c = countMap.get(key);
      return {
        report_date: key,
        title: '日報',
        summary: {
          total_spent_min: Number(r.total_spent_min) || 0,
          total: c ? c.total : null,   // daily_reports が無い日は null
          completed: c ? c.done : null,
          paused: null,
        },
      };
    });

    res.json(payload);
  } catch (e) {
    console.error('GET /reports/range error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

/**
 * GET /api/todo/reports/live
 * 今日(JST)のプレビュー
 * - daily_reports があれば period_start_at〜now() を使用
 * - 無ければ JST 00:00〜now() で集計
 */
router.get('/reports/live', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  // 今日のJST日付はDBで文字列化（to_char）してズレを避ける
  const { rows: drows } = await db.query(
    `SELECT to_char((now() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS d`
  );
  const dateStr = drows[0].d;

  try {
    const head = await fetchDailyReportHead(userId, dateStr);

    if (head) {
      // レポート期間で live 集計（上限は now()）
      const spentMap = await sumSessionsByItemWithin(userId, head.period_start_at, new Date());
      const itemsRows = (await db.query(
        `
        SELECT i.*
        FROM todo.items i
        WHERE i.user_id = $1 AND i.daily_report_id = $2
        ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
        `,
        [userId, head.id]
      )).rows;

      const items = itemsRows.map(i => {
        const planned =
          i.plan_start_at && i.plan_end_at
            ? Number((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000)
            : null;
        const spent = Math.round(spentMap.get(Number(i.id)) || 0);
        const tags =
          !i.tags_text || i.tags_text === '' ? [] : String(i.tags_text).split(',').map(s => s.trim()).filter(Boolean);
        return {
          id: i.id,
          title: i.title,
          status: String(i.status),
          category: i.category,
          remaining_unit: i.unit,
          remaining_amount: i.remaining_amount,
          planned_minutes: planned,
          spent_minutes: spent,
          tags,
        };
      });

      const totalSpent = items.reduce((a, r) => a + (r.spent_minutes || 0), 0);
      const completed  = items.filter(r => r.status === 'DONE').length;
      const paused     = items.filter(r => r.status === 'PAUSED').length;

      return res.json({
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
          period_start_at: head.period_start_at,
          period_end_at: null, // live
        },
        items,
      });
    } else {
      // 00:00〜now() のプレビュー（セッションがある item のみ）
      const b = jstBounds(dateStr);
      const spentMap = await sumSessionsByItemWithin(userId, b.start, new Date());
      const { rows: itemsRows } = await db.query(
        `
        WITH bounds AS (
          SELECT $2::timestamptz AS day_start
        ),
        used AS (
          SELECT DISTINCT s.item_id
          FROM todo.sessions s
          CROSS JOIN bounds b
          WHERE s.user_id = $1
            AND COALESCE(s.end_at, NOW()) > b.day_start
        )
        SELECT i.*
        FROM todo.items i
        JOIN used u ON u.item_id = i.id
        WHERE i.user_id = $1
        ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
        `,
        [userId, b.start]
      );

      const items = itemsRows.map(i => {
        const planned =
          i.plan_start_at && i.plan_end_at
            ? Number((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000)
            : null;
        const spent = Math.round(spentMap.get(Number(i.id)) || 0);
        const tags =
          !i.tags_text || i.tags_text === '' ? [] : String(i.tags_text).split(',').map(s => s.trim()).filter(Boolean);
        return {
          id: i.id,
          title: i.title,
          status: String(i.status),
          category: i.category,
          remaining_unit: i.unit,
          remaining_amount: i.remaining_amount,
          planned_minutes: planned,
          spent_minutes: spent,
          tags,
        };
      });

      const totalSpent = items.reduce((a, r) => a + (r.spent_minutes || 0), 0);
      const completed  = items.filter(r => r.status === 'DONE').length;
      const paused     = items.filter(r => r.status === 'PAUSED').length;

      return res.json({
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
          period_start_at: b.start,
          period_end_at: null,
        },
        items,
      });
    }
  } catch (e) {
    console.error('GET /reports/live error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

module.exports = router;
