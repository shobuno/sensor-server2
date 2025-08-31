// sensor-server/apps/todo/backend/routes/reports.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

/* ===================== Common helpers ===================== */

// JWT のどのキーに UUID が入っていても拾える
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
  // UTCの15:00=JST 00:00 付近に置くことで日跨ぎの誤差を避ける
  const base = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** JST の一日境界（24:00は使わない） */
function jstBounds(dateStr) {
  const start = `${dateStr}T00:00:00+09:00`;
  const end   = `${addDaysYmd(dateStr, 1)}T00:00:00+09:00`;
  return { start, end };
}

/** 指定日の daily_report を取得（作成はしない） */
async function fetchDailyReportHead(userId, dateStr) {
  const { rows } = await db.query(
    `SELECT id, user_id, report_date, period_start_at, period_end_at, summary
       FROM todo.daily_reports
      WHERE user_id=$1 AND report_date=$2::date
      LIMIT 1`,
    [userId, dateStr]
  );
  return rows[0] || null;
}

/** 指定日の item ごとのセッション（開始/終了）を返す（JST日付での交差条件） */
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
  return map; // Map<item_id:number, Array<{start_at, end_at}>>
}

/* ===================== Builders ===================== */

/**
 * v1.5仕様：日別レポート（ヘッダ+明細）を構築（ライブ集計：未保存プレビュー用）
 * 並び順：min(plan_start_at, firstSessionStart) の昇順。未設定は末尾。
 */
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

  // 期間内に使われた item を拾う
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
      [userId, startTs, endTs]
    )).rows;
  }

  // 当日のセッションを item ごとに取得
  let sessMap = null;
  if (withSessions) {
    sessMap = await fetchSessionsByItem(userId, dateStr);
  }

  const items = itemsRows.map(i => {
    const planned =
      i.plan_start_at && i.plan_end_at
        ? Math.max(0, Math.round((new Date(i.plan_end_at) - new Date(i.plan_start_at)) / 60000))
        : null;

    const sessArr = withSessions ? (sessMap?.get(Number(i.id)) || []) : [];
    const firstSessionAt = sessArr.length ? new Date(sessArr[0].start_at).getTime() : null;
    const planStartAtMs  = i.plan_start_at ? new Date(i.plan_start_at).getTime() : null;
    const keyCandidates = [planStartAtMs, firstSessionAt].filter(x => Number.isFinite(x));
    const sortKey = keyCandidates.length ? Math.min(...keyCandidates) : Number.POSITIVE_INFINITY;

    return {
      id: i.id,
      title: i.title,
      status: String(i.status),
      category: i.category,
      remaining_unit: i.unit,
      remaining_amount: i.remaining_amount,
      planned_minutes: planned,
      spent_minutes: null, // プレビューでは未計算（必要なら集計可）
      plan_start_at: i.plan_start_at,
      plan_end_at:   i.plan_end_at,
      tags: i.tags_text ? String(i.tags_text).split(',').map(s => s.trim()).filter(Boolean) : [],
      sessions: withSessions ? sessArr : undefined,
      note: i.description || null,
      _sortKey: sortKey,
    };
  });

  // 並び替え：sortKey があるもの→昇順、無いものは末尾
  items.sort((a, b) => (a._sortKey - b._sortKey));

  return {
    header: {
      date: dateStr,
      title: '日報（未保存プレビュー）',
      memo: head?.summary?.memo ?? '',
      summary: {
        total_spent_min: items.reduce((a, r) => a + (r.spent_minutes || 0), 0),
        completed: items.filter(r => r.status === 'DONE').length,
        paused:    items.filter(r => r.status === 'PAUSED').length,
        total:     items.length,
      },
      period_start_at: head ? head.period_start_at : jstBounds(dateStr).start,
      period_end_at:   head ? head.period_end_at   : null,
    },
    items,
  };
}

/**
 * スナップショット（保存済み）を構築
 * 並び順は sort_order → id
 */
async function buildDailyReportFromSnapshot(userId, dateStr, { withSessions = false } = {}) {
  const { rows } = await db.query(
    `SELECT dr.id, dr.report_date, dr.period_start_at, dr.period_end_at, dr.summary,
            to_char(dr.report_date,'YYYY-MM-DD') AS ymd
       FROM todo.daily_reports dr
      WHERE dr.user_id=$1 AND dr.report_date=$2::date
      LIMIT 1`,
    [userId, dateStr]
  );
  const head = rows[0];
  if (!head) return null;

  const { rows: rowsDri } = await db.query(
    `SELECT id, report_id, item_id, title, status,
            planned_minutes, spent_minutes, remaining_amount, remaining_unit,
            tags, note, sort_order,
            CASE WHEN $2::boolean THEN sessions ELSE '[]'::jsonb END AS sessions
       FROM todo.daily_report_items
      WHERE report_id=$1
      ORDER BY COALESCE(sort_order, 2147483647), id`,
    [head.id, withSessions === true]
  );
  if (!rowsDri.length) return null;

  const toTags = (t) => Array.isArray(t) ? t
    : (t == null ? [] : String(t).replace(/^\{|\}$/g,'').split(',').map(x=>x.trim()).filter(Boolean));

  const items = rowsDri.map(r => ({
    id: r.item_id,
    title: r.title,
    status: String(r.status),
    remaining_unit: r.remaining_unit,
    remaining_amount: r.remaining_amount,
    planned_minutes: r.planned_minutes,
    spent_minutes: r.spent_minutes,
    plan_start_at: null,
    plan_end_at: null,
    tags: toTags(r.tags),
    sessions: withSessions ? r.sessions : undefined,
    note: r.note ?? null
  }));

  const totalSpent = items.reduce((a, x) => a + (x.spent_minutes || 0), 0);
  const completed  = items.filter(x => x.status === 'DONE').length;
  const paused     = items.filter(x => x.status === 'PAUSED').length;

  return {
    header: {
      id: head.id,
      date: head.ymd,
      title: '日報（保存済み）',
      memo: head?.summary?.memo ?? '',
      summary: { total_spent_min: totalSpent, completed, paused, total: items.length },
      period_start_at: head.period_start_at,
      period_end_at:   head.period_end_at
    },
    items
  };
}

/* ===================== Routes ===================== */

/**
 * GET /todo/reports?date=YYYY-MM-DD[&with_sessions=1]
 * - スナップショットがあれば常に最優先で返す（period_end_at の有無は見ない）
 * - なければライブ集計
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
    const snap = await buildDailyReportFromSnapshot(userId, dateStr, { withSessions });
    if (snap) return res.json(snap);

    const live = await buildDailyReport(userId, dateStr, { withSessions });
    return res.json(live);
  } catch (e) {
    console.error('GET /reports error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

/**
 * PATCH /todo/reports
 * body: {
 *   date: "YYYY-MM-DD",
 *   memo?: string,
 *   items?: [{
 *     id:number,
 *     planned_minutes?: number|null,
 *     spent_minutes?: number|null,
 *     remaining_amount?: number|null,
 *     remaining_unit?: string|null,
 *     note?: string|null
 *   }]
 * }
 *
 * 仕様：
 * - フィールドが「送られてきた」場合だけ更新する（0 や "" も上書き）
 * - 送られてこなかったフィールドは据え置き
 * - 行が無ければ INSERT（未指定フィールドは NULL）
 */
router.patch('/reports', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const dateStr = toYmdJst(String(req.body?.date || '').trim());
  if (!dateStr) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const memo   = typeof req.body?.memo === 'string' ? req.body.memo : undefined;
  const inputs = Array.isArray(req.body?.items) ? req.body.items : [];

  console.log('[PATCH /todo/reports] user=', userId,
              'date=', dateStr,
              'memo.len=', (typeof memo === 'string' ? memo.length : null),
              'items.len=', inputs.length,
              'sample=', inputs[0] && {
                id: inputs[0].id,
                planned: inputs[0].planned_minutes,
                spent: inputs[0].spent_minutes,
                rem: inputs[0].remaining_amount,
                unit: inputs[0].remaining_unit
              });

  try {
    const head = await fetchDailyReportHead(userId, dateStr);
    if (!head) return res.status(404).json({ error: 'daily_report not found' });

    await db.query('BEGIN');

    // メモ更新（上書き）
    if (memo !== undefined) {
      await db.query(
        `UPDATE todo.daily_reports
            SET summary = jsonb_set(COALESCE(summary,'{}'::jsonb), '{memo}', to_jsonb($3::text), true),
                updated_at = now()
          WHERE user_id=$1 AND id=$2`,
        [userId, head.id, memo]
      );
    }

    let inserted = 0, updated = 0, skipped = 0;

    for (const x of inputs) {
      if (!x || !Number.isInteger(x.id)) { skipped++; continue; }

      // 既存行の有無
      const { rows: exRows } = await db.query(
        `SELECT id FROM todo.daily_report_items WHERE report_id=$1 AND item_id=$2 LIMIT 1`,
        [head.id, x.id]
      );
      const exists = !!exRows[0];

      if (!exists) {
        // INSERT（未指定フィールドは NULL のまま）
        await db.query(
          `
          INSERT INTO todo.daily_report_items (
            report_id, item_id, title, status,
            planned_minutes, spent_minutes, remaining_amount, remaining_unit,
            tags, note, sort_order, sessions, created_at
          )
          SELECT
            $1, i.id, i.title, i.status,
            $3,  $4,  $5,  $6,
            CASE WHEN i.tags_text IS NULL OR i.tags_text='' THEN ARRAY[]::text[] ELSE string_to_array(i.tags_text, ',') END,
            $7, NULL, '[]'::jsonb, now()
          FROM todo.items i
          WHERE i.user_id = $2 AND i.id = $8
          `,
          [
            head.id,
            userId,
            (x.hasOwnProperty('planned_minutes')   ? x.planned_minutes   : null),
            (x.hasOwnProperty('spent_minutes')     ? x.spent_minutes     : null),
            (x.hasOwnProperty('remaining_amount')  ? x.remaining_amount  : null),
            (x.hasOwnProperty('remaining_unit')    ? x.remaining_unit    : null),
            (x.hasOwnProperty('note')              ? x.note              : null),
            x.id
          ]
        );
        inserted++;
      } else {
        // 動的 UPDATE：送られてきたキーだけ SET
        const sets = [];
        const vals = [];
        if (x.hasOwnProperty('planned_minutes'))   { sets.push(`planned_minutes = $${sets.length+1}::int`);     vals.push(x.planned_minutes); }
        if (x.hasOwnProperty('spent_minutes'))     { sets.push(`spent_minutes = $${sets.length+1}::int`);       vals.push(x.spent_minutes); }
        if (x.hasOwnProperty('remaining_amount'))  { sets.push(`remaining_amount = $${sets.length+1}::numeric`); vals.push(x.remaining_amount); }
        if (x.hasOwnProperty('remaining_unit'))    { sets.push(`remaining_unit = $${sets.length+1}::text`);      vals.push(x.remaining_unit); }
        if (x.hasOwnProperty('note'))              { sets.push(`note = $${sets.length+1}::text`);               vals.push(x.note); }

        if (sets.length > 0) {
          vals.push(head.id, x.id);
          const q = `
            UPDATE todo.daily_report_items
               SET ${sets.join(', ') }
             WHERE report_id = $${vals.length-1} AND item_id = $${vals.length}
          `;
          await db.query(q, vals);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    await db.query('COMMIT');

    console.log('[PATCH /todo/reports] dynamic result => inserted:', inserted, 'updated:', updated, 'skipped:', skipped);

    // 保存後のスナップショットを返す
    const snap = await buildDailyReportFromSnapshot(userId, dateStr, { withSessions: true });
    return res.json({
      ok: true,
      saved_date: dateStr,
      snapshot: snap || null
    });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('PATCH /todo/reports error:', e);
    return res.status(500).json({ error: 'internal-error' });
  }
});

module.exports = router;
