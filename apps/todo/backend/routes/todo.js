// sensor-server/apps/todo/backend/routes/todo.js
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

// 配列/文字列どちらで来てもCSVに整える
function normalizeTagsCsv(body) {
  const { tags, tags_text } = body || {};
  if (typeof tags_text === 'string' && tags_text.trim() !== '') return tags_text.trim();
  if (Array.isArray(tags)) return tags.map(String).map(s => s.trim()).filter(Boolean).join(',');
  return null;
}

// due_at を組み立てる（JST固定）
function buildDueAt({ due_at, due_date, due_time }) {
  if (due_at !== undefined) return due_at;
  if (!due_date) return undefined;
  const time = (typeof due_time === 'string' && /^\d{2}:\d{2}$/.test(due_time)) ? due_time : '00:00';
  return `${due_date}T${time}:00+09:00`;
}

/* ======================= Items: CRUD / List ======================= */

/** GET /items/:id */
router.get('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const { rows } = await db.query(
    `SELECT id, title, description, status, today_flag, priority, due_at, category,
            unit, target_amount, remaining_amount, tags_text,
            plan_start_at, plan_end_at, daily_report_id, created_at, updated_at
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
  let { bucket, status, scope, today } = req.query;
  if (!bucket && scope) bucket = scope;

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const params = [userId];
  const where = [`i.user_id = $1`];

  if (today === '1' || today === 'true') {
    where.push(`(i.today_flag = true OR i.status = 'DOING'::todo.item_status)`);
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
      i.plan_start_at, i.plan_end_at, i.daily_report_id, i.created_at, i.updated_at,
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
    plan_start_at, plan_end_at,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title は必須です' });

  const tagsCsv = normalizeTagsCsv(req.body);
  const computedDueAt = buildDueAt({ due_at, due_date, due_time });

  const q = `
    INSERT INTO todo.items
      (user_id, title, description, status, today_flag, priority, due_at, category, unit,
       target_amount, remaining_amount, tags_text, plan_start_at, plan_end_at)
    VALUES ($1,$2,$3,'INBOX'::todo.item_status,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`;
  const vals = [
    userId, title, description ?? null,
    pin_today === true, normalizePriority(priority),
    computedDueAt ?? null, category ?? null, unit ?? null,
    target_amount ?? null, remaining_amount ?? null,
    tagsCsv, plan_start_at ?? null, plan_end_at ?? null,
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
    'plan_start_at','plan_end_at','daily_report_id',
  ];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k === 'due_at') continue;
    if (k in req.body) {
      if (k === 'status') {
        sets.push(`${k} = $${sets.length + 1}::todo.item_status`);
        vals.push(req.body[k]);
      } else if (k === 'priority') {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(normalizePriority(req.body[k]));
      } else if (k === 'tags_text') {
        sets.push(`${k} = $${sets.length + 1}`);
        vals.push(normalizeTagsCsv({ tags_text: req.body[k], tags: req.body.tags }));
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
    const own = await db.query(`SELECT 1 FROM todo.items WHERE id=$1 AND user_id=$2`, [id, userId]);
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

    // 対象をDOING + today_flag = true
    await db.query(
      `UPDATE todo.items
          SET status='DOING'::todo.item_status, today_flag=TRUE, updated_at=now()
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
          SET status='DONE'::todo.item_status, remaining_amount=0, updated_at=now()
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

/* ======================= Day (v1.5仕様) ======================= */

/**
 * GET /day/start
 * - 当日の daily_reports を自動生成（なければ）
 * - 表示対象:
 *   1) 当日の daily_report_id に紐づく items（チェックON表示用）
 *   2) daily_report_id IS NULL かつ status != DONE の items（候補）
 */
router.get('/day/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  try {
    // 当日レポートUPSERT（report_date = JSTのcurrent_date相当でOK）
    const { rows: drRows } = await db.query(`
      WITH upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        VALUES ($1, current_date, now(), now(), now())
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING id
      )
      SELECT id FROM upsert
      UNION ALL
      SELECT id FROM todo.daily_reports WHERE user_id = $1 AND report_date = current_date
      LIMIT 1
    `, [userId]);

    const dailyReportId = drRows[0]?.id;

    // 対象アイテム取得
    const { rows: items } = await db.query(
      `
      SELECT i.*
      FROM todo.items i
      LEFT JOIN todo.daily_reports dr ON dr.id = i.daily_report_id AND dr.id = $2
      WHERE i.user_id = $1
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
});

/**
 * POST /day/start/confirm
 * - 「今日の開始」でチェックONになった items を当日の daily_report_id に紐付け
 * body: { daily_report_id: number, item_ids: number[] }
 */
router.post('/day/start/confirm', async (req, res) => {
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
      [daily_report_id, userId, item_ids]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /todo/day/start/confirm error:', e);
    res.status(500).json({ error: 'confirm failed' });
  }
});

/**
 * POST /day/close
 * - 当日の daily_reports.period_end_at を now() に更新
 * - 当日のレポートに紐づく items のうち DONE 以外をコピーし、翌日以降候補へ戻す
 */
router.post('/day/close', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  await db.query('BEGIN');
  try {
    // 当日レポート取得（存在しなければここで終わり）
    const { rows: drRows } = await db.query(
      `SELECT id FROM todo.daily_reports WHERE user_id = $1 AND report_date = current_date`,
      [userId]
    );
    if (!drRows[0]) {
      await db.query('ROLLBACK');
      return res.json({ ok: true, note: 'no daily_report for today' });
    }
    const drId = drRows[0].id;

    // 未完了（DONE以外）をコピー
    await db.query(
      `
      WITH src AS (
        SELECT i.*
        FROM todo.items i
        WHERE i.user_id = $1
          AND i.daily_report_id = $2
          AND i.status <> 'DONE'::todo.item_status
      )
      INSERT INTO todo.items (
        user_id, title, description, status, today_flag, priority,
        due_at, plan_start_at, plan_end_at, category, unit,
        target_amount, remaining_amount, repeat, repeat_active,
        repeat_last_resolved_date, tags_text, created_at, updated_at, daily_report_id
      )
      SELECT
        user_id, title, description,
        'PAUSED'::todo.item_status, false, priority,
        due_at, plan_start_at, plan_end_at, category, unit,
        target_amount, remaining_amount, repeat, repeat_active,
        repeat_last_resolved_date, tags_text,
        now(), now(), NULL
      FROM src
      `
      , [userId, drId]
    );

    // 当日のレポートを締める
    await db.query(
      `UPDATE todo.daily_reports
          SET period_end_at = now(), updated_at = now()
        WHERE id = $1`,
      [drId]
    );

    // 旧itemsは today_flag を下ろす（status はそのまま: DONEはDONE、その他は現状維持）
    await db.query(
      `UPDATE todo.items
          SET today_flag = FALSE, updated_at = now()
        WHERE user_id = $1 AND daily_report_id = $2`,
      [userId, drId]
    );

    await db.query('COMMIT');
    res.json({ ok: true, daily_report_id: drId });
  } catch (e) {
    await db.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'close failed' });
  }
});

/* ===== 互換エイリアス（既存パスが残っている場合のため） ===== */
router.get ('/start',          (req, res, next) => router.handle({ ...req, url: '/day/start'          }, res, next));
router.post('/commit',         (req, res, next) => router.handle({ ...req, url: '/day/start/confirm'  }, res, next));
router.post('/close',          (req, res, next) => router.handle({ ...req, url: '/day/close'          }, res, next));

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

// 既存詳細系ルーター（必要なら）
router.use(require('./reports'));

module.exports = router;
