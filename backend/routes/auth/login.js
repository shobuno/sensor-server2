// sensor-server/backend/routes/auth/login.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../../config/db');
//require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

router.post('/', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'メールとパスワードを入力してください' });

  try {
    const result = await db.query(`
      SELECT u.*, ev.is_verified
      FROM auth.users u
      LEFT JOIN auth.email_verifications ev ON u.id = ev.user_id
      WHERE u.email = $1
      ORDER BY ev.created_at DESC
      LIMIT 1
    `, [email]);

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: '認証に失敗しました' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'メール認証が完了していません' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'パスワードが正しくありません' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
