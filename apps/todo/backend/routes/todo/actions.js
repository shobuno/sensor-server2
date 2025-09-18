// sensor-server/apps/todo/backend/routes/todo/actions.js
const { pool, getUserId } = require('./helpers');

function attachActionRoutes(router) {
  router.post('/items/:id/start', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const own = await client.query(`SELECT started_at FROM todo.items WHERE id=$1 AND user_id=$2`, [id, userId]);
      if (!own.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

      await client.query(
        `UPDATE todo.sessions SET end_at = now()
          WHERE user_id=$1 AND end_at IS NULL
            AND item_id IN (SELECT id FROM todo.items WHERE user_id=$1 AND status='DOING'::todo.item_status)`,
        [userId]
      );
      await client.query(
        `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
          WHERE user_id=$1 AND status='DOING'::todo.item_status`,
        [userId]
      );

      await client.query(
        `UPDATE todo.items
            SET status='DOING'::todo.item_status,
                today_flag=TRUE,
                started_at = COALESCE(started_at, now()),
                updated_at=now()
          WHERE id=$1 AND user_id=$2`,
        [id, userId]
      );

      const open = await client.query(
        `SELECT id FROM todo.sessions WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
        [id, userId]
      );
      if (!open.rowCount) {
        await client.query(`INSERT INTO todo.sessions (item_id, user_id, start_at) VALUES ($1,$2,now())`, [id, userId]);
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'start failed' });
    } finally {
      client.release();
    }
  });

  router.post('/items/:id/pause', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE todo.sessions SET end_at=now()
          WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
        [id, userId]
      );
      await client.query(
        `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
          WHERE id=$1 AND user_id=$2`,
        [id, userId]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'pause failed' });
    } finally {
      client.release();
    }
  });

  router.post('/items/:id/finish', async (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'no user id in token' });
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE todo.sessions SET end_at=now()
          WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
        [id, userId]
      );
      await client.query(
        `UPDATE todo.items
            SET status='DONE'::todo.item_status,
                remaining_amount=0,
                completed_at = now(),
                updated_at=now()
          WHERE id=$1 AND user_id=$2`,
        [id, userId]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK'); console.error(e);
      res.status(500).json({ error: 'finish failed' });
    } finally {
      client.release();
    }
  });
}

module.exports = { attachActionRoutes };
