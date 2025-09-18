// sensor-server/apps/todo/backend/routes/todo/reports.js
const { dbQuery, getUserId } = require('./helpers');

function attachReportRoutes(router) {
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
    const { rows } = await dbQuery(q, params);
    res.json(rows);
  });

  router.get('/reports/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = Number(req.params.id);
      if (!userId || !id) return res.status(400).json({ error: 'bad request' });

      const { rows } = await dbQuery(
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

      const period_start_at = req.body?.period_start_at ?? req.body?.start_at ?? null;
      const period_end_at   = req.body?.period_end_at   ?? req.body?.end_at   ?? null;

      if (!reportId || !userId) return res.status(400).json({ error: 'bad request' });
      if (period_start_at == null && period_end_at == null) {
        return res.status(400).json({ error: 'nothing to update', body: req.body });
      }

      const sets = [];
      const vals = [userId, reportId];
      if (period_start_at != null) { sets.push(`period_start_at = $${vals.length + 1}`); vals.push(new Date(period_start_at)); }
      if (period_end_at != null)   { sets.push(`period_end_at   = $${vals.length + 1}`); vals.push(new Date(period_end_at)); }

      const sql = `
        UPDATE todo.daily_reports
           SET ${sets.join(', ')}, updated_at = NOW()
         WHERE user_id = $1 AND id = $2
         RETURNING id, report_date, period_start_at, period_end_at, created_at, updated_at
      `;
      const { rows } = await dbQuery(sql, vals);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      res.json(rows[0]);
    } catch (e) {
      console.error('PATCH /todo/reports/:id error:', e, 'body=', req.body);
      res.status(500).json({ error: 'internal error' });
    }
  });

  router.get('/daily-reports/today', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });

    try {
      const { rows } = await dbQuery(
        `WITH jst AS (
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
         LIMIT 1`,
        [userId]
      );
      if (!rows[0]) return res.status(500).json({ error: 'cannot upsert daily_report' });
      res.json(rows[0]);
    } catch (e) {
      console.error('GET /todo/daily-reports/today error:', e);
      res.status(500).json({ error: 'internal-error' });
    }
  });
}

module.exports = { attachReportRoutes };
