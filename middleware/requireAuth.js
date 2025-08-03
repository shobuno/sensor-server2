
// sensor-server/middleware/requireAuth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    console.warn('🟡 トークンが送られていません');
    return res.status(401).json({ error: '認証トークンがありません' });
  }

  try {
    // console.log('🔐 検証中のトークン:', token);
    // console.log('🔐 使用するJWT_SECRET:', process.env.JWT_SECRET); // 追加！

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log('✅ JWT 検証成功:', decoded);

    req.user = decoded;
    next();
  } catch (err) {
    console.error('❌ JWT検証エラー:', err.message);
    return res.status(401).json({ error: '無効なトークンです' });
  }
};
