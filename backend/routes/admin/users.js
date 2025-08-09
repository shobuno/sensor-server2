// sensor-server/backend/routes/admin/users.js

const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { sendVerificationEmail } = require('../../utils/mailer');

// ユーザー一覧（既存のGET処理）
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, email, name, role, created_at
      FROM auth.users
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Admin User List Error:', err);
    res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
  }
});

function getBaseUrl(req) {
  if (process.env.FRONTEND_BASE_URL) return process.env.FRONTEND_BASE_URL;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host  = (req.headers['x-forwarded-host']  || req.get('host'));
  return `${proto}://${host}`;
}

// ✅ ユーザー登録と認証トークン生成
router.post('/', async (req, res) => {
  const { email, name, role, password } = req.body;

  if (!email || !name || !role || !password) {
    return res.status(400).json({ error: 'すべての項目が必須です' });
  }

  try {
    // 重複チェック
    const duplicate = await db.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: 'このメールアドレスは既に使用されています' });
    }

    // パスワードハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザー登録
    const insertUser = await db.query(
      `INSERT INTO auth.users (email, name, role, password_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [email, name, role, hashedPassword]
    );

    const newUserId = insertUser.rows[0].id;

    // トークン生成と保存
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24時間後

    await db.query(
      `INSERT INTO auth.email_verifications (user_id, verification_token, expires_at, is_verified, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [newUserId, token, expiresAt]
    );

    // ★ 認証メール送信（失敗しても登録自体は成功にする方針）
   try {
     const base = getBaseUrl(req);
     const verifyUrl = `${base}/verify-email?token=${token}`;
     await sendVerificationEmail(email, token, verifyUrl);

    } catch (e) {
      console.error('Send verification email failed:', e);
      // 必要ならここで return res.status(500)... にしてもOK
    }
   // レスポンスのリンクも同じものを返すとデバッグしやすい
   res.json({
     message: 'ユーザー登録完了。認証メールを送信しました。',
     verificationLink: `${getBaseUrl(req)}/verify-email?token=${token}`
   });

  } catch (err) {
    console.error('Admin User Registration Error:', err);
    res.status(500).json({ error: 'ユーザー登録に失敗しました' });
  }
});

module.exports = router;
