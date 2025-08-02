// sensor-server/backend/routes/adminUsers.js

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/authenticate');

// ユーザー情報の更新（名前・メール・権限・パスワード ※オプション）
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { email, name, role, password } = req.body;

  if (!email || !name || !role) {
    return res.status(400).json({ error: 'メール・名前・権限は必須です' });
  }

  try {
    // メール重複チェック（自分自身は除外）
    const duplicateCheck = await db.query(
      'SELECT id FROM auth.users WHERE email = $1 AND id != $2',
      [email, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'このメールアドレスは既に使用されています' });
    }

    // 動的にクエリ組み立て
    let query = `UPDATE auth.users SET email = $1, name = $2, role = $3`;
    let values = [email, name, role];
    let paramIndex = 4;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      query += `, password_hash = $${paramIndex}`;
      values.push(passwordHash);
      paramIndex++;
    }

    query += `, updated_at = NOW() WHERE id = $${paramIndex}`;
    values.push(id);

    await db.query(query, values);
    return res.json({ message: 'ユーザー情報を更新しました' });
  } catch (err) {
    console.error('ユーザー更新エラー:', err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// POST /api/admin/users - 新規ユーザー登録
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { email, name, role, password } = req.body;

  if (!email || !name || !role || !password) {
    return res.status(400).json({ error: '全ての項目（メール、名前、権限、パスワード）が必要です' });
  }

  try {
    // メールアドレス重複チェック
    const existing = await db.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'このメールアドレスは既に使用されています' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO auth.users (email, name, role, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [email, name, role, passwordHash]
    );

    return res.status(201).json({ message: 'ユーザーを登録しました' });
  } catch (err) {
    console.error('ユーザー登録エラー:', err);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
