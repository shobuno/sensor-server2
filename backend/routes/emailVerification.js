

// sensor-server/backend/routes/emailVerification.js


const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'トークンがありません' });
    }

    const result = await db.query(
      `SELECT * FROM auth.email_verifications WHERE verification_token = $1 AND is_verified = false`,
      [token]
    );
    
    console.log('🔍 受信トークン:', token);
    console.log('🧾 DB側トークン:', result.rows[0]?.verification_token);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: '無効または既に使用済みのトークンです' });
    }

    const record = result.rows[0];
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'トークンの有効期限が切れています' });
    }

    await db.query(
      `UPDATE auth.email_verifications SET is_verified = true WHERE id = $1`,
      [record.id]
    );

    return res.json({ message: 'メール認証が完了しました' });
  } catch (err) {
    console.error('メール認証エラー:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
