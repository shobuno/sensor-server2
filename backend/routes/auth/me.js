// sensor-server/backend/routes/auth/me.js

const express = require('express');
const router = express.Router();
// どちらかのミドルウェアを使ってください：
//   A) 共通の配列ロール対応版
//      const requireAuth = require('../../middleware/requireAuth');
//      router.get('/', requireAuth(), async (req, res) => { ... })
//   B) 既存 authMiddleware（JWTデコードして req.user を入れる前提）
const authMiddleware = require('../../config/authMiddleware');

const db = require('../../config/db');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { id } = req.user || {};
    if (!id) return res.status(401).json({ error: '認証トークンがありません' });

    const { rows } = await db.query(
      `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,                             -- 単一ロール（後方互換）
        COALESCE(u.roles,                   -- 複数ロール（text[]）
                 CASE WHEN u.role IS NULL THEN ARRAY[]::text[] ELSE ARRAY[u.role] END
        ) AS roles
      FROM auth.users u
      WHERE u.id = $1
      `,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const user = rows[0];

    // 返却フォーマットを明示（将来項目追加しても互換を保ちやすい）
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,          // 旧フィールド（後方互換）
      roles: user.roles || [],  // 新フィールド（常に配列）
    });
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
