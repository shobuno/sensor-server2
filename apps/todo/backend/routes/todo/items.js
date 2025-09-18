// sensor-server/apps/todo/backend/routes/todo/items.js
const {
  pool, dbQuery, getUserId,
  normalizePriority, denormalizePriority, normalizeBool, normalizeKind,
  normalizeTagsCsv, buildDueAt,
  extractRepeatSpecFromBody,
} = require('./helpers');

const { upsertRepeatRuleFromItem } = require('./repeat_logic');

function attachItemRoutes(router) {
  router.get('/items/:id', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id' });
    const { rows } = await dbQuery(`SELECT * FROM todo.items WHERE user_id=$1 AND id=$2`, [userId, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    rows[0].priority = denormalizePriority(rows[0].priority);
    res.json(rows[0]);
  });

  router.get('/items', async (req, res) => {
    let { bucket, status, scope, today, item_type, kind } = req.query;
    if (!bucket && scope) bucket = scope;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id' });

    const params = [userId];
    const where = [`i.user_id=$1`];

    const rawKind = (item_type || kind || '').toString().toLowerCase();
    const kindMap = { normal: 'NORMAL', template: 'TEMPLATE', repeat_rule: 'REPEAT', repeat: 'REPEAT' };
    if (rawKind && kindMap[rawKind]) {
      params.push(kindMap[rawKind]); where.push(`i.kind=$${params.length}::todo.item_kind`);
    }

    if (today === '1' || today === 'true') {
      where.push(`(
        (
          i.today_flag=TRUE
          AND EXISTS (
            SELECT 1 FROM todo.daily_reports dr
             WHERE dr.id=i.daily_report_id
               AND dr.user_id=i.user_id
               AND dr.report_date=(now() AT TIME ZONE 'Asia/Tokyo')::date
          )
        )
        OR i.status='DOING'::todo.item_status
      )`);
    } else if (bucket === 'someday') {
      where.push(`i.today_flag=false`);
    }

    if (status) {
      params.push(status);
      where.push(`i.status=$${params.length}::todo.item_status`);
    }

    const q = `
      SELECT i.*,
        COALESCE((
          SELECT SUM(
            CASE WHEN s.end_at IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (s.end_at-s.start_at))
                 ELSE EXTRACT(EPOCH FROM (now()-s.start_at)) END
          )::int
            FROM todo.sessions s
           WHERE s.user_id=i.user_id AND s.item_id=i.id
        ),0) AS run_seconds
      FROM todo.items i
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN i.due_at IS NULL THEN 1 ELSE 0 END,
        i.due_at ASC,
        i.priority ASC,
        i.id
    `;
    const { rows } = await dbQuery(q, params);
    res.json(rows.map(r => ({ ...r, priority: denormalizePriority(r.priority) })));
  });

  router.post('/items', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id' });

    const {
      title, description, priority, due_at, due_date, due_time,
      category, unit, target_amount, remaining_amount,
      pin_today, today_flag, kind, todo_flag,
      plan_start_at, plan_end_at, planned_minutes, sort_order, daily_report_id,
      favorite, note,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });

    const tagsCsv = normalizeTagsCsv(req.body);
    const computedDueAt = buildDueAt({ due_at, due_date, due_time });

    const tf = normalizeBool(today_flag, null);
    const todayFlag = (tf !== null) ? tf : (pin_today === true ? true : true);
    const kindNorm = normalizeKind(kind);
    const repeatSpec = extractRepeatSpecFromBody(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insRes = await client.query(
        `INSERT INTO todo.items
           (user_id,title,description,status,today_flag,priority,due_at,category,unit,
            target_amount,remaining_amount,tags_text,
            plan_start_at,plan_end_at,planned_minutes,sort_order,daily_report_id,
            favorite,note,kind,todo_flag)
         VALUES
           ($1,$2,$3,'INBOX',$4,$5,$6,$7,$8,
            $9,$10,$11,
            $12,$13,$14,$15,$16,
            $17,$18,$19::todo.item_kind,$20)
         RETURNING *`,
        [userId, title, (description ?? null),
         todayFlag, normalizePriority(priority),
         (computedDueAt ?? null), (category ?? null), (unit ?? null),
         (target_amount ?? null), (remaining_amount ?? null),
         tagsCsv,
         (plan_start_at ?? null), (plan_end_at ?? null),
         (planned_minutes ?? null),
         (Number.isInteger(sort_order) ? sort_order : null),
         (Number.isInteger(daily_report_id) ? daily_report_id : null),
         (favorite === true), (note ?? null),
         kindNorm, (typeof todo_flag === 'boolean' ? todo_flag : true)]
      );
      let row = insRes.rows[0];

      const wantsRepeat =
        kindNorm === 'REPEAT' && repeatSpec && typeof repeatSpec.type === 'string' && repeatSpec.type !== 'none';

      if (wantsRepeat) {
        const ruleId = await upsertRepeatRuleFromItem(userId, {
          repeat_rule_id: req.body?.repeat_rule_id ?? null,
          title, summary: req.body?.summary ?? null,
          rule: repeatSpec, timezone: req.body?.timezone ?? 'Asia/Tokyo',
          due_offset_days: req.body?.due_offset_days ?? 0,
          default_today_flag: !!req.body?.default_today_flag,
          default_todo_flag: !!req.body?.default_todo_flag,
        });

        await client.query(
          `UPDATE todo.items SET kind='REPEAT', repeat_rule_id=$2, updated_at=NOW()
            WHERE id=$1 AND user_id=$3`,
          [row.id, ruleId, userId]
        );

        const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
        row = r2.rows[0] || row;
      }

      await client.query('COMMIT');
      row.priority = denormalizePriority(row.priority);
      res.status(201).json(row);
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'create failed' });
    } finally {
      client.release();
    }
  });

  router.patch('/items/:id', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id' });

    const computedDueAt = buildDueAt({ due_at: req.body?.due_at, due_date: req.body?.due_date, due_time: req.body?.due_time });

    const allowed = [
      'title','description','status','priority','due_at',
      'category','unit','target_amount','remaining_amount','tags_text','today_flag',
      'plan_start_at','plan_end_at','planned_minutes','sort_order','daily_report_id',
      'favorite','note','kind','todo_flag',
    ];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sets = [], vals = [];
      for (const k of allowed) {
        if (k === 'due_at') continue;
        if (k in req.body) {
          if (k === 'status') {
            sets.push(`${k}=$${sets.length+1}::todo.item_status`); vals.push(req.body[k]);
          } else if (k === 'kind') {
            sets.push(`${k}=$${sets.length+1}::todo.item_kind`); vals.push(normalizeKind(req.body[k]));
          } else if (k === 'priority') {
            sets.push(`${k}=$${sets.length+1}`); vals.push(normalizePriority(req.body[k]));
          } else if (k === 'tags_text') {
            sets.push(`${k}=$${sets.length+1}`); vals.push(require('./helpers').normalizeTagsCsv(req.body));
          } else if (k === 'today_flag') {
            sets.push(`${k}=$${sets.length+1}`); vals.push(normalizeBool(req.body[k], false));
          } else {
            sets.push(`${k}=$${sets.length+1}`); vals.push(req.body[k]);
          }
        }
      }
      if (computedDueAt !== undefined) { sets.push(`due_at=$${sets.length+1}`); vals.push(computedDueAt); }

      vals.push(userId, req.params.id);
      const q = `
        UPDATE todo.items
           SET ${sets.join(', ') || 'updated_at=now()'}, updated_at=now()
         WHERE user_id=$${vals.length-1} AND id=$${vals.length}
         RETURNING *`;
      const { rows } = sets.length
        ? await client.query(q, vals)
        : await client.query(`SELECT * FROM todo.items WHERE user_id=$1 AND id=$2`, [userId, req.params.id]);

      if (!rows[0]) {
        await client.query('ROLLBACK'); return res.status(404).json({ error:'not found' });
      }
      let row = rows[0];

      const requestedKindPresent = Object.prototype.hasOwnProperty.call(req.body, 'kind');
      const requestedKind = requestedKindPresent ? normalizeKind(req.body.kind) : row.kind;

      const repeatInRequest = Object.prototype.hasOwnProperty.call(req.body, 'repeat');
      const repeatSpec = repeatInRequest ? require('./helpers').extractRepeatSpecFromBody(req.body) : null;

      if (requestedKindPresent && row.kind === 'REPEAT' && requestedKind !== 'REPEAT') {
        await client.query(`UPDATE todo.items SET repeat_rule_id=NULL WHERE id=$1 AND user_id=$2`, [row.id, userId]);
        const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
        row = r2.rows[0] || row;
      }

      if (repeatInRequest) {
        const effectiveKind = requestedKind;
        if (repeatSpec && repeatSpec.type && repeatSpec.type !== 'none' && effectiveKind === 'REPEAT') {
          const ruleId = await upsertRepeatRuleFromItem(userId, {
            repeat_rule_id: row.repeat_rule_id ?? null,
            title: row.title, summary: row.summary ?? null,
            rule: repeatSpec, timezone: 'Asia/Tokyo',
            due_offset_days: 0,
            default_today_flag: !!row.today_flag,
            default_todo_flag: !!row.todo_flag,
          });
          if (ruleId && row.repeat_rule_id !== ruleId) {
            await client.query(`UPDATE todo.items SET repeat_rule_id=$1 WHERE id=$2 AND user_id=$3`, [ruleId, row.id, userId]);
            const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
            row = r2.rows[0] || row;
          }
        } else {
          await client.query(`UPDATE todo.items SET repeat_rule_id=NULL WHERE id=$1 AND user_id=$2`, [row.id, userId]);
          const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
          row = r2.rows[0] || row;
        }
      }

      await client.query('COMMIT');
      row.priority = denormalizePriority(row.priority);
      res.json(row);
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'update failed' });
    } finally {
      client.release();
    }
  });

  router.delete('/items/:id', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id' });
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'bad id' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const r1 = await client.query(
        `SELECT id, kind, repeat_rule_id FROM todo.items
          WHERE user_id=$1 AND id=$2 FOR UPDATE`,
        [userId, itemId]
      );
      if (!r1.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }
      const target = r1.rows[0];

      await client.query(`DELETE FROM todo.items WHERE user_id=$1 AND id=$2`, [userId, itemId]);

      if (target.kind === 'REPEAT' && target.repeat_rule_id != null) {
        const ruleId = Number(target.repeat_rule_id);
        const existOtherRepeat = await client.query(
          `SELECT 1 FROM todo.items
            WHERE user_id=$1 AND kind='REPEAT'::todo.item_kind
              AND repeat_rule_id=$2 AND id<>$3 LIMIT 1`,
          [userId, ruleId, itemId]
        );
        if (!existOtherRepeat.rowCount) {
          await client.query(
            `UPDATE todo.items
                SET repeat_rule_id=NULL, updated_at=now()
              WHERE user_id=$1 AND repeat_rule_id=$2`,
            [userId, ruleId]
          );
          await client.query(
            `DELETE FROM todo.repeat_rules WHERE user_id=$1 AND id=$2`,
            [userId, ruleId]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK'); console.error('DELETE /items/:id failed:', e);
      res.status(500).json({ error: 'delete failed' });
    } finally {
      client.release();
    }
  });
}

module.exports = { attachItemRoutes };
