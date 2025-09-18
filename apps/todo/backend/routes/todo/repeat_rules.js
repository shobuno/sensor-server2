// sensor-server/apps/todo/backend/routes/todo/repeat_rules.js
const { dbQuery, getUserId } = require('./helpers');

function attachRepeatRuleRoutes(router) {
  router.get('/repeat-rules', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error:'no user id' });
    const { rows } = await dbQuery(`SELECT * FROM todo.repeat_rules WHERE user_id=$1 ORDER BY id DESC`, [userId]);
    res.json(rows);
  });

  router.post('/repeat-rules', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error:'no user id' });
    const { title, summary, rule } = req.body || {};
    if (!title || !rule) return res.status(400).json({ error:'title,rule required' });
    const { rows } = await dbQuery(
      `INSERT INTO todo.repeat_rules (user_id,title,summary,"rule")
       VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
      [userId, title, summary ?? null, JSON.stringify(rule)]
    );
    res.status(201).json(rows[0]);
  });

  router.patch('/repeat-rules/:id', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error:'no user id' });
    const { id } = req.params;
    const sets = [], vals = [];
    if (req.body.title   !== undefined) { sets.push(`title=$${sets.length+1}`);   vals.push(req.body.title); }
    if (req.body.summary !== undefined) { sets.push(`summary=$${sets.length+1}`); vals.push(req.body.summary); }
    if (req.body.rule    !== undefined) { sets.push(`"rule"=$${sets.length+1}::jsonb`); vals.push(JSON.stringify(req.body.rule)); }
    if (!sets.length) return res.json({ ok:true });
    vals.push(userId, id);
    const { rows } = await dbQuery(
      `UPDATE todo.repeat_rules SET ${sets.join(',')}, updated_at=now()
         WHERE user_id=$${vals.length-1} AND id=$${vals.length}
         RETURNING *`, vals
    );
    if (!rows[0]) return res.status(404).json({ error:'not found' });
    res.json(rows[0]);
  });

  router.delete('/repeat-rules/:id', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error:'no user id' });
    const { id } = req.params;
    const { rowCount } = await dbQuery(
      `DELETE FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (!rowCount) return res.status(404).json({ error:'not found' });
    res.json({ ok:true });
  });
}

module.exports = { attachRepeatRuleRoutes };
