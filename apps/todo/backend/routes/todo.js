// sensor-server/apps/todo/backend/routes/todo.js

const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

// --- priority: 1..5 を数値で扱う ---
function normalizePriority(input) {
  if (input == null) return 3; // デフォルトは真ん中
  const n = Number(input);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
}
function denormalizePriority(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 3;
}

// JWTのどのキーにUUIDが入っていても拾えるように
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

/** -------------------------------------------
 * 期限合成ユーティリティ（JST固定）
 * 優先順位:
 *  1) body.due_at が undefined でない場合はそれをそのまま使う（nullも許容）
 *  2) due_date(+due_time) があれば "YYYY-MM-DDTHH:mm:00+09:00" を返す
 *  3) どちらも無ければ undefined（=現状維持）
 * ----------------------------------------- */
function buildDueAt({ due_at, due_date, due_time }) {
  if (due_at !== undefined) return due_at; // string or null
  if (!due_date) return undefined;
  const time = (typeof due_time === 'string' && /^\d{2}:\d{2}$/.test(due_time)) ? due_time : '00:00';
  return `${due_date}T${time}:00+09:00`;
}

// =============== Items: CRUD / List =================

/** GET /items/:id */
router.get('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { rows } = await db.query(
    `SELECT id, title, description, status, today_flag, priority, due_at, category,
            unit, target_amount, remaining_amount, tags_text,
            plan_start_at, plan_end_at,
            created_at, updated_at
       FROM todo.items
      WHERE user_id = $1 AND id = $2`,
    [userId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  const row = rows[0]; row.priority = denormalizePriority(row.priority);
  res.json(row);
});

/** GET /items?bucket=today|someday&status=INBOX|DOING|PAUSED|DONE&today=1 */
router.get('/items', async (req, res) => {
  let { bucket, status, scope, today } = req.query;
  if (!bucket && scope) bucket = scope; // 後方互換

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const params = [userId];
  const where = [`i.user_id = $1`];

  if (today === '1' || today === 'true') {
   // ★ today_flag か DOING のどちらかを「今日」に含める
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
      i.plan_start_at, i.plan_end_at,
      i.created_at, i.updated_at,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN s.end_at IS NOT NULL THEN EXTRACT(EPOCH FROM (s.end_at - s.start_at))
            ELSE EXTRACT(EPOCH FROM (now() - s.start_at))
          END
        )::int
        FROM todo.sessions s
        WHERE s.user_id = i.user_id AND s.item_id = i.id
      ), 0) AS run_seconds,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN s.end_at IS NOT NULL THEN EXTRACT(EPOCH FROM (LEAST(s.end_at, now()) - s.start_at))
            ELSE EXTRACT(EPOCH FROM (now() - s.start_at))
          END
        )::int
        FROM todo.sessions s
        WHERE s.user_id = i.user_id
          AND s.item_id = i.id
          AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date
      ), 0) AS today_run_seconds
    FROM todo.items i
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(i.due_at, i.created_at) ASC,
             i.priority ASC, i.id ASC
  `;

  const { rows } = await db.query(q, params);
  res.json(rows.map(r => ({ ...r, priority: denormalizePriority(r.priority) })));
});

/** POST /items  （登録直後は INBOX。pin_today=true なら today_flag=true） */
router.post('/items', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const {
    title, description, priority,
    // 期限: 直接 or 分割の両対応
    due_at, due_date, due_time,
    category, unit, target_amount, remaining_amount, pin_today,
    // 新規: 予定開始/終了
    plan_start_at, plan_end_at,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title は必須です' });

  const tagsCsv = normalizeTagsCsv(req.body);
  const computedDueAt = buildDueAt({ due_at, due_date, due_time });

  const q = `
    INSERT INTO todo.items
    (user_id, title, description, status, today_flag, priority, due_at, category, unit,
     target_amount, remaining_amount, tags_text, plan_start_at, plan_end_at)
    VALUES
      ($1,$2,$3,'INBOX'::todo.item_status,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`;
  const vals = [
    userId, title, description ?? null,
    pin_today === true,                               // today_flag
    normalizePriority(priority),
    computedDueAt ?? null, category ?? null, unit ?? null,
    target_amount ?? null, remaining_amount ?? null,
    tagsCsv,
    plan_start_at ?? null, plan_end_at ?? null,
  ];

  const { rows } = await db.query(q, vals);
  const row = rows[0]; row.priority = denormalizePriority(row.priority);
  res.status(201).json(row);
});

/** PATCH /items/:id  （statusは ::todo.item_status でキャスト） */
router.patch('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  // 期限は due_at / due_date / due_time の3つで受け、最終的に due_at に反映
  const computedDueAt = buildDueAt({
    due_at: req.body?.due_at,
    due_date: req.body?.due_date,
    due_time: req.body?.due_time,
  });

  const allowed = [
    'title','description','status','priority','due_at',
    'category','unit','target_amount','remaining_amount','tags_text','today_flag',
    // 新規: 予定開始/終了
    'plan_start_at','plan_end_at',
  ];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k === 'due_at') continue; // due_at は後でまとめて反映
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

  // due_at系が一つでも指定されていれば反映（nullも可）
  if (computedDueAt !== undefined) {
    sets.push(`due_at = $${sets.length + 1}`);
    vals.push(computedDueAt);
  }

  if (!sets.length) return res.json({ ok: true });

  vals.push(userId, req.params.id);
  const q = `
    UPDATE todo.items
       SET ${sets.join(', ')}, updated_at = now()
     WHERE user_id = $${vals.length - 1} AND id = $${vals.length}
    RETURNING *`;
  const { rows } = await db.query(q, vals);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  const row = rows[0]; row.priority = denormalizePriority(row.priority);
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

// =============== Items: start / pause / finish =================

/** POST /items/:id/start  （他のDOING→PAUSED + セッション終了 → 対象をDOING & セッション開始） */
router.post('/items/:id/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    const own = await db.query(`SELECT 1 FROM todo.items WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!own.rowCount) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

    // 既存DOINGをPAUSEDに（セッション終了）
    await db.query(
      `UPDATE todo.sessions SET end_at = now()
         WHERE user_id = $1 AND end_at IS NULL
           AND item_id IN (SELECT id FROM todo.items WHERE user_id = $1 AND status = 'DOING'::todo.item_status)`,
      [userId]
    );
    await db.query(
      `UPDATE todo.items
          SET status = 'PAUSED'::todo.item_status, updated_at = now()
        WHERE user_id = $1 AND status = 'DOING'::todo.item_status`,
      [userId]
    );

    // 対象を DOING
    await db.query(
     `UPDATE todo.items
        SET status = 'DOING'::todo.item_status,
            today_flag = TRUE,                      -- ★ 今日に必ず載せる
            updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    // セッション開始（オープンが無ければ作成）
    const open = await db.query(
      `SELECT id FROM todo.sessions WHERE item_id = $1 AND user_id = $2 AND end_at IS NULL`,
      [id, userId]
    );
    if (!open.rowCount) {
      await db.query(
        `INSERT INTO todo.sessions (item_id, user_id, start_at) VALUES ($1,$2, now())`,
        [id, userId]
      );
    }

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'start failed' });
  }
});

/** POST /items/:id/pause  （セッション終了 + status=PAUSED） */
router.post('/items/:id/pause', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    const own = await db.query(`SELECT 1 FROM todo.items WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!own.rowCount) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

    await db.query(
      `UPDATE todo.sessions SET end_at = now()
         WHERE item_id = $1 AND user_id = $2 AND end_at IS NULL`,
      [id, userId]
    );
    await db.query(
      `UPDATE todo.items
          SET status = 'PAUSED'::todo.item_status, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'pause failed' });
  }
});

/** POST /items/:id/finish  （セッション終了 + status=DONE + 残量0） */
router.post('/items/:id/finish', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  await db.query('BEGIN');
  try {
    const own = await db.query(`SELECT 1 FROM todo.items WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!own.rowCount) { await db.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

    await db.query(
      `UPDATE todo.items
          SET status = 'DONE'::todo.item_status,
              remaining_amount = 0,
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'finish failed' });
  }
});

// =============== Day plan: commit / close =================

router.get('/day/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const q = `
    WITH base AS (
      SELECT *
    FROM todo.items
    WHERE user_id = $1
    AND status IN ('INBOX', 'PAUSED', 'DOING')  -- ★ DOING も候補に
    ),
    mark AS (
      SELECT
        id, title, status, today_flag, priority, due_at, category, unit, remaining_amount,
        (due_at IS NOT NULL AND due_at::date < CURRENT_DATE) AS overdue,
        (due_at IS NOT NULL AND due_at::date = CURRENT_DATE) AS required,
        (status = 'PAUSED') AS carryover
      FROM base
    )
    SELECT * FROM mark
    ORDER BY (CASE WHEN due_at IS NULL THEN 1 ELSE 0 END),
             due_at NULLS LAST,
             priority NULLS LAST,
             id;
  `;
  try {
    const { rows } = await db.query(q, [userId]);
    res.json({ items: rows });
  } catch (e) {
    console.error('GET /todo/day/start error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

router.post('/day/commit', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { item_ids } = req.body || {};
  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'item_ids is required' });
  }

  await db.query('BEGIN');
  try {
    // ★ DOING は常に today_flag=true、選択分も true、その他は false
    await db.query(
      `UPDATE todo.items
          SET today_flag = CASE
                             WHEN status = 'DOING'::todo.item_status THEN TRUE
                             WHEN id = ANY($2::int[])                  THEN TRUE
                             ELSE FALSE
                           END,
              updated_at = now()
        WHERE user_id = $1
          AND status <> 'DONE'::todo.item_status`,
     [userId, item_ids]
    );

    const { rows: dpRows } = await db.query(
      `INSERT INTO todo.day_plans (user_id, workday, committed_at)
       VALUES ($1, now()::date, now())
       ON CONFLICT (user_id, workday) DO UPDATE
         SET committed_at = EXCLUDED.committed_at
       RETURNING id`,
      [userId]
    );
    const planId = dpRows[0].id;

    await db.query(
      `INSERT INTO todo.day_plan_items (plan_id, item_id, sort_order, reason)
       SELECT $1, x, row_number() OVER (), 'MANUAL'::todo.plan_reason
       FROM unnest($2::int[]) AS x
       ON CONFLICT (plan_id, item_id) DO NOTHING`,
      [planId, item_ids]
    );

    await db.query('COMMIT');
    res.json({ ok: true, plan_id: planId });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'commit failed' });
  }
});

/**
 * POST /day/close
 * body: { remaining: [{ id:number, remaining_amount:number }]}
 */
router.post('/day/close', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const entries = Array.isArray(req.body?.remaining) ? req.body.remaining : [];

  await db.query('BEGIN');
  try {
    const m = new Map();
    for (const e of entries) {
      const id = Number(e?.id);
      let rem = Number(e?.remaining_amount);
      if (!Number.isFinite(rem) || rem < 0) rem = 0;
      if (Number.isInteger(id)) m.set(id, rem);
    }
    const entryIds = Array.from(m.keys());

    if (entryIds.length > 0) {
      await db.query(
        `UPDATE todo.items AS t
            SET remaining_amount = v.rem, updated_at = now()
          FROM (SELECT unnest($1::int[]) AS id,
                       unnest($2::double precision[]) AS rem) v
         WHERE t.id = v.id
           AND t.user_id = $3
           AND t.status <> 'DONE'::todo.item_status`,
        [entryIds, entryIds.map(id => m.get(id)), userId]
      );
    }

    await db.query(
      `UPDATE todo.sessions SET end_at = now()
         WHERE user_id = $1
           AND end_at IS NULL
           AND item_id IN (
                 SELECT id FROM todo.items
                  WHERE user_id = $1 AND today_flag = true
               )`,
      [userId]
    );

    await db.query(
      `UPDATE todo.items
          SET status = 'PAUSED'::todo.item_status,
              updated_at = now()
        WHERE user_id = $1
          AND today_flag = true
          AND status <> 'DONE'::todo.item_status`,
      [userId]
    );

    await db.query(
      `UPDATE todo.items
          SET today_flag = false, updated_at = now()
        WHERE user_id = $1
          AND today_flag = true`,
      [userId]
    );

    await db.query(
      `INSERT INTO todo.day_closures (user_id, workday, closed_at)
       VALUES ($1, now()::date, now())
       ON CONFLICT (user_id, workday)
       DO UPDATE SET closed_at = EXCLUDED.closed_at`,
      [userId]
    );

    await db.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'close failed' });
  }
});

// =============== Reports =================

/** GET /reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get('/reports/daily', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { from, to } = req.query;

  const params = [userId];
  let extra = '';
  if (from) { params.push(from); extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date >= $${params.length}`; }
  if (to)   { params.push(to);   extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date <= $${params.length}`; }

  const q = `
    SELECT
      (s.start_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
      ROUND(SUM(s.duration_sec)/3600.0, 2) AS hours
    FROM todo.sessions s
    WHERE s.user_id = $1 AND s.end_at IS NOT NULL
      ${extra}
    GROUP BY jst_date
    ORDER BY jst_date DESC
  `;
  const { rows } = await db.query(q, params);
  res.json(rows);
});

module.exports = router;
