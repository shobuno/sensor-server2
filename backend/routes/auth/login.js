// sensor-server/backend/routes/auth/login.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../../config/db');

router.post('/', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'メールとパスワードを入力してください' });
  }

  try {
    // users.roles（text[]）を取得。無い環境でも落ちないように SELECT 列を明示
    const { rows } = await db.query(
      `
      SELECT
        u.id, u.email, u.password_hash,
        u.role,                 -- 後方互換（単一ロール）
        COALESCE(u.roles, '{}') AS roles,   -- 複数ロール（text[]）
        COALESCE(ev.is_verified, true) AS is_verified
      FROM auth.users u
      LEFT JOIN auth.email_verifications ev
        ON u.id = ev.user_id
      WHERE u.email = $1
      ORDER BY ev.created_at DESC NULLS LAST
      LIMIT 1
      `,
      [email]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: '認証に失敗しました' });
    if (!user.is_verified) return res.status(403).json({ error: 'メール認証が完了していません' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'パスワードが正しくありません' });

    // roles は配列を優先、無ければ単一 role を配列に
    const roles = Array.isArray(user.roles) && user.roles.length
      ? user.roles
      : (user.role ? [user.role] : []);

    const payload = {
      id: user.id,
      email: user.email,
      roles,           // 新: 配列ロール
      role: user.role, // 旧: 後方互換のため残す
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 使い方に合わせて：JSON返却（現状のフロント想定）
    return res.json({ token });

    // もし Cookie セッションで運用したい場合は、上の return を削り以下を有効化:
    /*
    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'None',  // 異なるポート/ドメインで叩くなら None + Secure
      secure: true,      // 本番は true、ローカルHTTPなら false
      maxAge: 24*60*60*1000,
    });
    return res.json({ ok: true });
    */
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
