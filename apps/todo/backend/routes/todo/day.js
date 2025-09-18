// sensor-server/apps/todo/backend/routes/todo/day.js
const {
  dbQuery, pool, dlog,
  getUserId, denormalizePriority, resolveJstDate, jstBounds, jstTodayYmd,
} = require('./helpers');
const { generateItemsFromRepeatRules } = require('./repeat_logic');

async function upsertDailyReportAndGetId(userId, dateStr) {
  if (dateStr) {
    const { rows } = await dbQuery(
      `WITH upsert AS (
         INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
         VALUES ($1, $2::date, now(), now(), now())
         ON CONFLICT (user_id, report_date) DO NOTHING
         RETURNING id
       )
       SELECT id FROM upsert
       UNION ALL
       SELECT id FROM todo.daily_reports WHERE user_id = $1 AND report_date = $2::date
       LIMIT 1`,
      [userId, dateStr]
    );
    return rows[0]?.id || null;
  } else {
    const { rows } = await dbQuery(
      `WITH jst AS ( SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d ),
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
       LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }
}

function attachDayRoutes(router) {
  router.get('/day/start', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });

    const dateStr = resolveJstDate(req.query?.date);
    dlog('day/start enter', { userId, dateStr });

    try {
      const dailyReportId = await upsertDailyReportAndGetId(userId, dateStr);
      dlog('day/start upsert daily_report', { dailyReportId });

      await generateItemsFromRepeatRules(userId);
      dlog('day/start after generate');

      const { start: dayStart, end: dayEnd } = jstBounds(dateStr || jstTodayYmd());

      await dbQuery(`
        UPDATE todo.items n
          SET daily_report_id = $1, today_flag = TRUE, updated_at = now()
          FROM todo.items r
          LEFT JOIN todo.repeat_rules rr ON rr.id = r.repeat_rule_id AND rr.user_id = r.user_id
        WHERE n.user_id=$2
          AND n.kind='NORMAL'::todo.item_kind
          AND n.repeat_rule_id = rr.id
          AND r.kind='REPEAT'::todo.item_kind
          AND COALESCE(rr.default_today_flag, FALSE) = TRUE
          AND n.daily_report_id IS NULL
          AND n.due_at >= $3::timestamptz AND n.due_at < $4::timestamptz
      `, [dailyReportId, userId, dayStart, dayEnd]);

      const { rows: items } = await dbQuery(
        `SELECT i.* FROM todo.items i
         LEFT JOIN todo.daily_reports dr ON dr.id = i.daily_report_id AND dr.id = $2
         WHERE i.user_id = $1
           AND i.kind = 'NORMAL'::todo.item_kind
           AND (dr.id IS NOT NULL OR (i.daily_report_id IS NULL AND i.status <> 'DONE'::todo.item_status))
         ORDER BY
           CASE WHEN i.due_at IS NULL THEN 1 ELSE 0 END, i.due_at ASC, i.priority ASC, i.id`,
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

  router.post('/day/start/confirm', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });

    const { daily_report_id, item_ids } = req.body || {};
    if (!Number.isInteger(daily_report_id) || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'daily_report_id and item_ids are required' });
    }

    try {
      await dbQuery(
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

  router.post('/day/close', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const dateStr = require('./helpers').resolveJstDate(req.body?.date);
    const inputs = Array.isArray(req.body?.items) ? req.body.items : [];

    async function pickDailyReportRow(client) {
      if (dateStr) {
        const r = await client.query(
          `SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
             FROM todo.daily_reports dr
            WHERE dr.user_id=$1 AND dr.report_date=$2::date LIMIT 1`,
          [userId, dateStr]
        );
        return r.rows[0] || null;
      } else {
        const r = await client.query(
          `WITH jst AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date d)
           SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
             FROM todo.daily_reports dr, jst
            WHERE dr.user_id=$1 AND dr.report_date=jst.d LIMIT 1`,
          [userId]
        );
        return r.rows[0] || null;
      }
    }

    const client = await require('./helpers').pool.connect();
    try {
      await client.query('BEGIN');

      const dr = await pickDailyReportRow(client);
      if (!dr) { await client.query('ROLLBACK'); return res.json({ ok: true, note: 'no daily_report for the date' }); }

      const reportId = dr.id;
      const ymd = dr.ymd;
      const { start: dayStart, end: dayEnd } = require('./helpers').jstBounds(ymd);

      const { rows: itemsRows } = await client.query(
        `SELECT * FROM todo.items
          WHERE user_id=$1 AND daily_report_id=$2
          ORDER BY COALESCE(plan_start_at, due_at, created_at), priority, id`,
        [userId, reportId]
      );
      const itemIdList = itemsRows.map(i => Number(i.id));

      const { rows: rawSessions } = await client.query(
        `WITH bounds AS (SELECT $2::timestamptz AS day_start, $3::timestamptz AS day_end)
         SELECT s.item_id,
                GREATEST(s.start_at, b.day_start) AS start_at,
                LEAST(COALESCE(s.end_at, now()), b.day_end) AS end_at
           FROM todo.sessions s
           CROSS JOIN bounds b
          WHERE s.user_id=$1
            AND s.item_id = ANY($4::int[])
            AND s.start_at < b.day_end
            AND COALESCE(s.end_at, now()) > b.day_start
          ORDER BY s.start_at`,
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

      for (const it of itemsRows) {
        const itemIdNum = Number(it.id);
        const inp = inputMap.get(itemIdNum) || {};

        if (inp.remaining_amount !== undefined) {
          await client.query(
            `UPDATE todo.items SET remaining_amount=$3, updated_at=now()
              WHERE user_id=$1 AND id=$2`,
            [userId, itemIdNum, inp.remaining_amount === null ? null : Number(inp.remaining_amount)]
          );
        }

        const planned =
          (inp.planned_minutes != null) ? Number(inp.planned_minutes) :
          (it.planned_minutes != null) ? Number(it.planned_minutes) :
          (it.plan_start_at && it.plan_end_at)
            ? Math.max(0, Math.round((new Date(it.plan_end_at) - new Date(it.plan_start_at)) / 60000))
            : null;

        const sessionsArr = (sessByItem.get(itemIdNum) || []).map(s => ({
          ...s, plan_start_at: it.plan_start_at || null, plan_end_at: it.plan_end_at || null, planned_minutes: (planned ?? null),
        }));
        const sessionsJson = JSON.stringify(sessionsArr);

        const spent =
          (inp.spent_minutes != null) ? Number(inp.spent_minutes)
                                      : sessionsArr.reduce((a, s) => a + Math.round(s.seconds / 60), 0);

        const tagsArr = it.tags_text ? String(it.tags_text).split(',').map(s => s.trim()).filter(Boolean) : [];

        const upd = await client.query(
          `UPDATE todo.daily_report_items
              SET title=$3, status=$4, planned_minutes=$5, spent_minutes=$6,
                  remaining_amount=$7, remaining_unit=$8, tags=$9::text[], note=$10, sessions=$11::jsonb
            WHERE report_id=$1 AND item_id=$2
            RETURNING id`,
          [reportId, itemIdNum, it.title, String(it.status), planned, spent, it.remaining_amount, it.unit, tagsArr, (inp.note ?? it.note ?? null), sessionsJson]
        );

        if (upd.rowCount === 0) {
          await client.query(
            `INSERT INTO todo.daily_report_items (
               report_id, item_id, title, status, planned_minutes, spent_minutes,
               remaining_amount, remaining_unit, tags, note, sessions, created_at
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11::jsonb, now())`,
            [reportId, itemIdNum, it.title, String(it.status), planned, spent, it.remaining_amount, it.unit, tagsArr, (inp.note ?? it.note ?? null), sessionsJson]
          );
        }
      }

      await client.query(
        `UPDATE todo.daily_report_items AS dri
            SET note = i.description
          FROM todo.items AS i
         WHERE dri.report_id = $1
           AND i.user_id    = $2
           AND dri.item_id  = i.id
           AND (dri.note IS NULL OR dri.note = '')`,
        [reportId, userId]
      );

      await client.query(
        `UPDATE todo.daily_reports
            SET period_end_at = now(), updated_at = now()
          WHERE id = $1`,
        [reportId]
      );

      await client.query(
        `DELETE FROM todo.sessions WHERE user_id=$1 AND item_id = ANY($2::int[])`,
        [userId, itemsRows.map(i => i.id)]
      );

      await client.query(
        `UPDATE todo.items
            SET daily_report_id = NULL, today_flag = FALSE, updated_at = now()
          WHERE user_id=$1 AND daily_report_id=$2 AND status <> 'DONE'::todo.item_status`,
        [userId, reportId]
      );

      await client.query(
        `DELETE FROM todo.items WHERE user_id=$1 AND daily_report_id=$2 AND status='DONE'::todo.item_status`,
        [userId, reportId]
      );

      await client.query('COMMIT');
      res.json({ ok: true, daily_report_id: reportId });
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'close failed' });
    } finally {
      client.release();
    }
  });

  // 互換エイリアス
  router.get ('/start',  (req, res) => router.handle(req, res)); // noop for compatibility (kept below)
  router.get ('/start',  (req, res, next) => next()); // fallthrough
  router.get ('/start',  (req, res) => {}); // no-op

  router.get ('/start',  (req, res) => {}); // 保険
  router.get('/start',   (req, res, next) => next()); // 旧: GET /todo/start -> /day/start に統合
  router.get('/day/start', (req, res, next) => next()); // 実体は上の定義

  router.post('/commit', (req, res, next) => next());
  router.post('/close',  (req, res, next) => next());
}
// 上記の alias は既存互換のための “空の中継” ですが、
// 実エンドポイントはこのファイル内の /day/* を利用してください。

module.exports = { attachDayRoutes };
