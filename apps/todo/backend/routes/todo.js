// server2/apps/todo/backend/routes/todo.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

/* ======================= Helpers ======================= */

// 1..5 を数値で扱う
function normalizePriority(input) {
  if (input == null) return 3;
  const n = Number(input);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
}
function denormalizePriority(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 3;
}

// JWTのどのキーにUUIDが入っていても拾える
function getUserId(req) {
  return req?.user?.id || req?.user?.id_uuid;
}

// 配列/文字列どちらで来てもCSVに整える（DBは tags_text に保存）
function normalizeTagsCsv(body) {
  const { tags, tags_text } = body || {};
  if (typeof tags_text === 'string' && tags_text.trim() !== '') return tags_text.trim();
  if (Array.isArray(tags)) return tags.map(String).map(s => s.trim()).filter(Boolean).join(',');
  return null;
}

// due_at を組み立てる（JST固定）
function buildDueAt({ due_at, due_date, due_time }) {
  if (due_at !== undefined) return due_at; // すでに timestamptz が来ている想定
  if (!due_date) return undefined;
  const time = (typeof due_time === 'string' && /^\d{2}:\d{2}$/.test(due_time)) ? due_time : '00:00';
  return `${due_date}T${time}:00+09:00`;
}

// JST日付（YYYY-MM-DD）を決める。明示指定を優先し、なければ null。
function resolveJstDate(inputDate) {
  if (typeof inputDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)) return inputDate;
  return null;
}

/** YYYY-MM-DD に日数を足すユーティリティ（JST日付用） */
function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)); // JST 0時に合わせる
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/* ======================= Items: CRUD / List ======================= */

/** GET /items/:id */
router.get('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const { rows } = await db.query(
    `SELECT id, title, description, status, today_flag, priority, due_at, category,
            unit, target_amount, remaining_amount, tags_text,
            plan_start_at, plan_end_at, planned_minutes, sort_order,
            started_at, completed_at, daily_report_id, favorite, note,
            kind, todo_flag,
            created_at, updated_at
       FROM todo.items
      WHERE user_id = $1 AND id = $2`,
    [userId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  const row = rows[0];
  row.priority = denormalizePriority(row.priority);
  res.json(row);
});

/** GET /items?bucket=today|someday&status=...&today=1 */
router.get('/items', async (req, res) => {
  let { bucket, status, scope, today, item_type, kind } = req.query;
  if (!bucket && scope) bucket = scope;

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const params = [userId];
  const where = [`i.user_id = $1`];

  // --- kind / item_type フィルタ（normal | template | repeat_rule） ---
  // 互換のため kind=normal|template|repeat でも受ける
  const rawKind = (item_type || kind || '').toString().toLowerCase();
  const kindMap = {
    normal: 'NORMAL',
    template: 'TEMPLATE',
    repeat_rule: 'REPEAT_RULE',
    repeat: 'REPEAT_RULE',
  };
  if (rawKind && kindMap[rawKind]) {
    params.push(kindMap[rawKind]);
    where.push(`i.kind = $${params.length}::todo.item_kind`);
  }

  if (today === '1' || today === 'true') {
    // today_flag=true かつ「JST今日の daily_report」に紐づくレコードのみ表示
    // （DOING は今日扱いで常に表示）
    where.push(`(
      (
        i.today_flag = TRUE
        AND EXISTS (
          SELECT 1
            FROM todo.daily_reports dr
           WHERE dr.id = i.daily_report_id
             AND dr.user_id = i.user_id
             AND dr.report_date = (now() AT TIME ZONE 'Asia/Tokyo')::date
        )
      )
      OR i.status = 'DOING'::todo.item_status
    )`);
  } else if (bucket === 'someday') {
    where.push(`i.today_flag = false`);
  }
  if (status) {
    params.push(status);
    where.push(`i.status = $${params.length}::todo.item_status`);
  }

  const q = `
    SELECT
      i.id, i.title, i.description, i.status, i.today_flag, i.priority, i.due_at, i.category,
      i.unit, i.target_amount, i.remaining_amount, i.tags_text,
      i.plan_start_at, i.plan_end_at, i.planned_minutes, i.sort_order,
      i.started_at, i.completed_at, i.daily_report_id, i.favorite, i.note,
      i.kind, i.todo_flag,
      i.created_at, i.updated_at,
      COALESCE((
        SELECT SUM(
          CASE WHEN s.end_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (s.end_at - s.start_at))
               ELSE EXTRACT(EPOCH FROM (now() - s.start_at)) END
        )::int
          FROM todo.sessions s
         WHERE s.user_id = i.user_id AND s.item_id = i.id
      ), 0) AS run_seconds,
      COALESCE((
        SELECT SUM(
          CASE WHEN s.end_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (LEAST(s.end_at, now()) - s.start_at))
               ELSE EXTRACT(EPOCH FROM (now() - s.start_at)) END
        )::int
          FROM todo.sessions s
         WHERE s.user_id = i.user_id
           AND s.item_id = i.id
           AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date
      ), 0) AS today_run_seconds
    FROM todo.items i
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at) ASC, i.priority ASC, i.id ASC
  `;
  const { rows } = await db.query(q, params);
  res.json(rows.map(r => ({ ...r, priority: denormalizePriority(r.priority) })));
});

/** POST /items */
router.post('/items', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const {
    title, description, priority,
    due_at, due_date, due_time,
    category, unit, target_amount, remaining_amount, pin_today,
    kind, todo_flag,
    plan_start_at, plan_end_at, planned_minutes, sort_order, daily_report_id,
    favorite, note,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title は必須です' });

  const tagsCsv = normalizeTagsCsv(req.body);
  const computedDueAt = buildDueAt({ due_at, due_date, due_time });

  const q = `
    INSERT INTO todo.items
      (user_id, title, description, status, today_flag, priority, due_at, category, unit,
       target_amount, remaining_amount, tags_text,
       plan_start_at, plan_end_at, planned_minutes, sort_order, daily_report_id,
       favorite, note, kind, todo_flag)
    VALUES
      ($1,$2,$3,'INBOX'::todo.item_status,$4,$5,$6,$7,$8,
       $9,$10,$11,
       $12,$13,$14,$15,$16,
       $17,$18,$19::todo.item_kind,$20)
    RETURNING *`;
  const vals = [
    userId, title, description ?? null,
    pin_today === true, normalizePriority(priority),
    computedDueAt ?? null, category ?? null, unit ?? null,
    target_amount ?? null, remaining_amount ?? null,
    tagsCsv,
    plan_start_at ?? null, plan_end_at ?? null, (planned_minutes ?? null), (Number.isInteger(sort_order) ? sort_order : null), (Number.isInteger(daily_report_id) ? daily_report_id : null),
    (favorite === true), (note ?? null),
    (typeof kind === 'string' ? kind : 'NORMAL'),
    (typeof todo_flag === 'boolean' ? todo_flag : true),
  ];
  const { rows } = await db.query(q, vals);
  const row = rows[0];
  row.priority = denormalizePriority(row.priority);
  res.status(201).json(row);
});

/** PATCH /items/:id */
router.patch('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const computedDueAt = buildDueAt({
    due_at: req.body?.due_at, due_date: req.body?.due_date, due_time: req.body?.due_time,
  });

  const allowed = [
    'title','description','status','priority','due_at',
    'category','unit','target_amount','remaining_amount','tags_text','today_flag',
    'plan_start_at','plan_end_at','planned_minutes','sort_order','daily_report_id',
    'favorite','note',
    'kind','todo_flag',
  ];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k === 'due_at') continue; // 別でまとめて処理
    if (k in req.body) {
      if (k === 'status') {
        sets.push(`${k} = $${sets.length + 1}::todo.item_status`);
        vals.push(req.body[k]);
      } else if (k === 'kind') {
        sets.push(`${k} = $${sets.length + 1}::todo.item_kind`);
        vals.push(req.body[k]);
      } else if (k === 'priority') {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(normalizePriority(req.body[k]));
      } else if (k === 'tags_text') {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(normalizeTagsCsv({ tags_text: req.body[k], tags: req.body.tags }));
      } else if (k === 'sort_order') {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(Number.isInteger(req.body[k]) ? req.body[k] : null);
      } else {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(req.body[k]);
      }
    }
  }
  if (computedDueAt !== undefined) { sets.push(`due_at = $${sets.length + 1}`); vals.push(computedDueAt); }
  if (!sets.length) return res.json({ ok: true });

  vals.push(userId, req.params.id);
  const q = `
    UPDATE todo.items
       SET ${sets.join(', ')}, updated_at = now()
     WHERE user_id = $${vals.length - 1} AND id = $${vals.length}
    RETURNING *`;
  const { rows } = await db.query(q, vals);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  const row = rows[0];
  row.priority = denormalizePriority(row.priority);
  res.json(row);
});

/** DELETE /items/:id */
router.delete('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { rowCount } = await db.query(
    `DELETE FROM todo.items WHERE user_id = $1 AND id = $2`,
    [userId, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ======================= Items: start / pause / finish ======================= */

/** POST /items/:id/start */
router.post('/items/:id/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    const own = await db.query(`SELECT started_at FROM todo.items WHERE id=$1 AND user_id=$2`, [id, userId]);
    if (!own.rowCount) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

    // 既存DOINGを停止
    await db.query(
      `UPDATE todo.sessions SET end_at = now()
        WHERE user_id=$1 AND end_at IS NULL
          AND item_id IN (SELECT id FROM todo.items WHERE user_id=$1 AND status='DOING'::todo.item_status)`,
      [userId]
    );
    await db.query(
      `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
        WHERE user_id=$1 AND status='DOING'::todo.item_status`,
      [userId]
    );

    // 対象をDOING + today_flag = true + started_at（初回のみ）
    await db.query(
      `UPDATE todo.items
          SET status='DOING'::todo.item_status,
              today_flag=TRUE,
              started_at = COALESCE(started_at, now()),
              updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );

    // セッションを開く（無ければ）
    const open = await db.query(
      `SELECT id FROM todo.sessions WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    if (!open.rowCount) {
      await db.query(`INSERT INTO todo.sessions (item_id, user_id, start_at) VALUES ($1,$2,now())`, [id, userId]);
    }

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'start failed' });
  }
});

/** POST /items/:id/pause */
router.post('/items/:id/pause', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE todo.sessions SET end_at=now()
        WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    await db.query(
      `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'pause failed' });
  }
});

/** POST /items/:id/finish */
router.post('/items/:id/finish', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE todo.sessions SET end_at=now()
        WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    await db.query(
      `UPDATE todo.items
          SET status='DONE'::todo.item_status,
              remaining_amount=0,
              completed_at = now(),
              updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'finish failed' });
  }
});

/* ======================= Day (v1.5仕様ベース + v1.7連携) ======================= */

/**
 * 共通：当日の daily_reports を upsert してIDを返す
 * - dateStr が null の場合は JST今日、そうでなければその日付
 */
async function upsertDailyReportAndGetId(userId, dateStr /* YYYY-MM-DD or null */) {
  if (dateStr) {
    const { rows } = await db.query(
      `
      WITH upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        VALUES ($1, $2::date, now(), now(), now())
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING id
      )
      SELECT id FROM upsert
      UNION ALL
      SELECT id FROM todo.daily_reports WHERE user_id = $1 AND report_date = $2::date
      LIMIT 1
      `,
      [userId, dateStr]
    );
    return rows[0]?.id || null;
  } else {
    const { rows } = await db.query(
      `
      WITH jst AS ( SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d ),
      upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        SELECT $1, jst.d, now(), now(), now() FROM jst
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING id
      )
      SELECT id FROM upsert
      UNION ALL
      SELECT dr.id FROM todo.daily_reports dr, jst
       WHERE dr.user_id = $1 AND dr.report_date = jst.d
      LIMIT 1
      `,
      [userId]
    );
    return rows[0]?.id || null;
  }
}

/**
 * GET /day/start?date=YYYY-MM-DD（省略可）
 * - 当日の daily_reports を自動生成（なければ）
 * - 表示対象:
 *   1) 当日の daily_report_id に紐づく items（チェックON表示用）
 *   2) daily_report_id IS NULL かつ status != DONE の items（候補）
 */
async function handleGetDayStart(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const dateStr = resolveJstDate(req.query?.date);

  try {
    const dailyReportId = await upsertDailyReportAndGetId(userId, dateStr);

    const { rows: items } = await db.query(
      `
      SELECT i.*
      FROM todo.items i
      LEFT JOIN todo.daily_reports dr ON dr.id = i.daily_report_id AND dr.id = $2
      WHERE i.user_id = $1
        AND i.kind = 'NORMAL'::todo.item_kind
        AND (
          dr.id IS NOT NULL
          OR (i.daily_report_id IS NULL AND i.status <> 'DONE'::todo.item_status)
        )
      ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
      `,
      [userId, dailyReportId]
    );

    res.json({
      daily_report_id: dailyReportId,
      items: items.map(r => ({ ...r, priority: denormalizePriority(r.priority) })),
    });
  } catch (e) {
    console.error('GET /todo/day/start error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
}
router.get('/day/start', handleGetDayStart);

// GET /api/todo/reports/:id
router.get('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!userId || !id) return res.status(400).json({ error: 'bad request' });

    const { rows } = await db.query(
      `SELECT id, report_date, period_start_at, period_end_at, created_at, updated_at
         FROM todo.daily_reports
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /todo/reports/:id error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

router.patch('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const reportId = Number(req.params.id);

    const period_start_at =
      req.body?.period_start_at ?? req.body?.start_at ?? null;
    const period_end_at =
      req.body?.period_end_at ?? req.body?.end_at ?? null;

    if (!reportId || !userId) {
      return res.status(400).json({ error: 'bad request' });
    }
    if (period_start_at == null && period_end_at == null) {
      return res.status(400).json({ error: 'nothing to update', body: req.body });
    }

    const sets = [];
    const vals = [userId, reportId];
    if (period_start_at != null) {
      sets.push(`period_start_at = $${vals.length + 1}`);
      vals.push(new Date(period_start_at));
    }
    if (period_end_at != null) {
      sets.push(`period_end_at = $${vals.length + 1}`);
      vals.push(new Date(period_end_at));
    }

    const sql = `
      UPDATE todo.daily_reports
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING id, report_date, period_start_at, period_end_at, created_at, updated_at
    `;
    const { rows } = await db.query(sql, vals);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /todo/reports/:id error:', e, 'body=', req.body);
    res.status(500).json({ error: 'internal error' });
  }
});

/**
 * POST /day/start/confirm
 * body: { daily_report_id: number, item_ids: number[] }
 */
async function handlePostDayStartConfirm(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const { daily_report_id, item_ids } = req.body || {};
  if (!Number.isInteger(daily_report_id) || !Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'daily_report_id and item_ids are required' });
  }

  try {
    await db.query(
      `UPDATE todo.items
          SET daily_report_id = $1, today_flag = TRUE, updated_at = now()
        WHERE user_id = $2 AND id = ANY($3::int[])`,
      [daily_report_id, getUserId(req), item_ids]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /todo/day/start/confirm error:', e);
    res.status(500).json({ error: 'confirm failed' });
  }
}
router.post('/day/start/confirm', handlePostDayStartConfirm);

/**
 * POST /day/close
 * body: {
 *   date?: "YYYY-MM-DD",
 *   items?: [{ id:number, planned_minutes?:number|null, spent_minutes?:number|null,
 *              remaining_amount?:number|null, note?:string }]
 * }
 *
 * 仕様（合意版）:
 * - 未完了 items はコピーせず再利用（daily_report_id を NULL、today_flag=false にして繰り越し）
 * - 完了 items は daily_report_items にスナップショット後に物理削除
 * - スナップショット確定後、該当 report に紐づく items の sessions をユーザー分だけ全削除
 */
async function handlePostDayClose(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const dateStr = resolveJstDate(req.body?.date);
  const inputs = Array.isArray(req.body?.items) ? req.body.items : [];

  function jstBounds(ymd) {
    const start = `${ymd}T00:00:00+09:00`;
    const end   = `${addDaysYmd(ymd, 1)}T00:00:00+09:00`;
    return { start, end };
  }

  async function pickDailyReportRow() {
    if (dateStr) {
      const r = await db.query(
        `SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
           FROM todo.daily_reports dr
          WHERE dr.user_id=$1 AND dr.report_date=$2::date
          LIMIT 1`,
        [userId, dateStr]
      );
      return r.rows[0] || null;
    } else {
      const r = await db.query(
        `WITH jst AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date d)
         SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
           FROM todo.daily_reports dr, jst
          WHERE dr.user_id=$1 AND dr.report_date=jst.d
          LIMIT 1`,
        [userId]
      );
      return r.rows[0] || null;
    }
  }

  await db.query('BEGIN');
  try {
    const dr = await pickDailyReportRow();
    if (!dr) {
      await db.query('ROLLBACK');
      return res.json({ ok: true, note: 'no daily_report for the date' });
    }

    const reportId = dr.id;
    const ymd = dr.ymd;
    const { start: dayStart, end: dayEnd } = jstBounds(ymd);

    const { rows: itemsRows } = await db.query(
      `SELECT *
         FROM todo.items
        WHERE user_id=$1 AND daily_report_id=$2
        ORDER BY COALESCE(plan_start_at, due_at, created_at), priority, id`,
      [userId, reportId]
    );
    const itemIdList = itemsRows.map(i => Number(i.id));

    const { rows: rawSessions } = await db.query(
      `
      WITH bounds AS (SELECT $2::timestamptz AS day_start, $3::timestamptz AS day_end)
      SELECT s.item_id,
             GREATEST(s.start_at, b.day_start) AS start_at,
             LEAST(COALESCE(s.end_at, now()), b.day_end) AS end_at
        FROM todo.sessions s
        CROSS JOIN bounds b
       WHERE s.user_id=$1
         AND s.item_id = ANY($4::int[])
         AND s.start_at < b.day_end
         AND COALESCE(s.end_at, now()) > b.day_start
       ORDER BY s.start_at
      `,
      [userId, dayStart, dayEnd, itemIdList]
    );

    const sessByItem = new Map();
    for (const r of rawSessions) {
      const key = Number(r.item_id);
      const seconds = Math.max(0, Math.floor((new Date(r.end_at) - new Date(r.start_at)) / 1000));
      const arr = sessByItem.get(key) || [];
      arr.push({ start_at: r.start_at, end_at: r.end_at, seconds });
      sessByItem.set(key, arr);
    }

    const inputMap = new Map();
    for (const x of inputs) if (x && Number.isInteger(x.id)) inputMap.set(Number(x.id), x);

    // --- スナップショット（手動UPSERT） ---
    for (const it of itemsRows) {
      const itemIdNum = Number(it.id);
      const inp = inputMap.get(itemIdNum) || {};

      if (inp.remaining_amount !== undefined) {
        await db.query(
          `UPDATE todo.items
              SET remaining_amount=$3, updated_at=now()
            WHERE user_id=$1 AND id=$2`,
          [userId, itemIdNum, inp.remaining_amount === null ? null : Number(inp.remaining_amount)]
        );
      }

      // 予定分
      const planned =
        (inp.planned_minutes != null) ? Number(inp.planned_minutes) :
        (it.planned_minutes != null) ? Number(it.planned_minutes) :
        (it.plan_start_at && it.plan_end_at)
          ? Math.max(0, Math.round((new Date(it.plan_end_at) - new Date(it.plan_start_at)) / 60000))
          : null;

      const sessionsArr = sessByItem.get(itemIdNum) || [];

      // セッション要素に予定情報を付与
      const sessionsArrWithPlan = sessionsArr.map(s => ({
        ...s,
        plan_start_at: it.plan_start_at || null,
        plan_end_at: it.plan_end_at || null,
        planned_minutes: (planned ?? null),
      }));

      const sessionsJson = JSON.stringify(sessionsArrWithPlan);

      const spent =
        (inp.spent_minutes != null) ? Number(inp.spent_minutes)
                                    : sessionsArr.reduce((a, s) => a + Math.round(s.seconds / 60), 0);

      const tagsArr = it.tags_text
        ? String(it.tags_text).split(',').map(s => s.trim()).filter(Boolean)
        : [];

      // UPDATE → INSERT
      const upd = await db.query(
        `
        UPDATE todo.daily_report_items
           SET title = $3,
               status = $4,
               planned_minutes = $5,
               spent_minutes = $6,
               remaining_amount = $7,
               remaining_unit = $8,
               tags = $9::text[],
               note = $10,
               sessions = $11::jsonb
         WHERE report_id = $1 AND item_id = $2
         RETURNING id
        `,
        [
          reportId,            // $1
          itemIdNum,           // $2
          it.title,            // $3
          String(it.status),   // $4
          planned,             // $5
          spent,               // $6
          it.remaining_amount, // $7
          it.unit,             // $8
          tagsArr,             // $9
          (inp.note ?? it.note ?? null),  // $10
          sessionsJson         // $11
        ]
      );

      if (upd.rowCount === 0) {
        await db.query(
          `
          INSERT INTO todo.daily_report_items (
            report_id, item_id, title, status,
            planned_minutes, spent_minutes,
            remaining_amount, remaining_unit,
            tags, note, sessions, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11::jsonb, now())
          `,
          [
            reportId,
            itemIdNum,
            it.title,
            String(it.status),
            planned,
            spent,
            it.remaining_amount,
            it.unit,
            tagsArr,
            (inp.note ?? it.note ?? null),
            sessionsJson
          ]
        );
      }
    }

    // description の後追いコピー（note 未設定のみ）
    await db.query(
      `
      UPDATE todo.daily_report_items AS dri
         SET note = i.description
        FROM todo.items AS i
       WHERE dri.report_id = $1
         AND i.user_id    = $2
         AND dri.item_id  = i.id
         AND (dri.note IS NULL OR dri.note = '')
      `,
      [reportId, userId]
    );

    // レポートの締め
    await db.query(
      `
      UPDATE todo.daily_reports
         SET period_end_at = now(),
             updated_at = now()
       WHERE id = $1
      `,
      [reportId]
    );

    // セッション削除（当ユーザー分のみ）
    await db.query(
      `
      DELETE FROM todo.sessions
       WHERE user_id = $1
         AND item_id = ANY($2::int[])
      `,
      [userId, itemIdList]
    );

    // 未完了は再利用・完了は物理削除
    await db.query(
      `
      UPDATE todo.items
         SET daily_report_id = NULL,
             today_flag = FALSE,
             updated_at = now()
       WHERE user_id = $1
         AND daily_report_id = $2
         AND status <> 'DONE'::todo.item_status
      `,
      [userId, reportId]
    );

    await db.query(
      `
      DELETE FROM todo.items
       WHERE user_id = $1
         AND daily_report_id = $2
         AND status = 'DONE'::todo.item_status
      `,
      [userId, reportId]
    );

    await db.query('COMMIT');
    res.json({ ok: true, daily_report_id: reportId });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'close failed' });
  }
}

router.post('/day/close', handlePostDayClose);

/* ===== 互換エイリアス ===== */
router.get ('/start',  (req, res) => handleGetDayStart(req, res));
router.post('/commit', (req, res) => handlePostDayStartConfirm(req, res));
router.post('/close',  (req, res) => handlePostDayClose(req, res));

/* ======================= Reports (daily summary list) ======================= */

router.get('/reports/daily', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { from, to } = req.query;

  const params = [userId];
  let extra = '';
  if (from) { params.push(from); extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date >= $${params.length}`; }
  if (to)   { params.push(to);   extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date <= $${params.length}`; }

  const q = `
    SELECT (s.start_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
           ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.end_at,now())-s.start_at)))/3600.0,2) AS hours
      FROM todo.sessions s
     WHERE s.user_id=$1 AND s.end_at IS NOT NULL
       ${extra}
     GROUP BY jst_date
     ORDER BY jst_date DESC
  `;
  const { rows } = await db.query(q, params);
  res.json(rows);
});

/** ======================= Daily Reports ======================= **/

/**
 * GET /daily-reports/today
 * - JST「今日」の daily_reports を返す（無ければ作って返す）
 */
router.get('/daily-reports/today', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  try {
    const { rows } = await db.query(
      `
      WITH jst AS (
        SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d
      ),
      upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        SELECT $1, jst.d, now(), now(), now() FROM jst
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING *
      )
      SELECT * FROM upsert
      UNION ALL
      SELECT dr.* FROM todo.daily_reports dr, jst
       WHERE dr.user_id = $1 AND dr.report_date = jst.d
      LIMIT 1
      `,
      [userId]
    );
    if (!rows[0]) return res.status(500).json({ error: 'cannot upsert daily_report' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /todo/daily-reports/today error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

// 詳細レポート系ルーター（既存）
router.use(require('./reports'));

module.exports = router;
