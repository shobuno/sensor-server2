// sensor-server/backend/routes/auth/me.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../config/authMiddleware');
const db = require('../../config/db');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { id } = req.user; // ← JWTのid
    const result = await db.query(
      `SELECT id, email, name, role
         FROM auth.users
        WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    res.json(result.rows[0]); // ← name含む
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
