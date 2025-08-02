// sensor-server/backend/config/authMiddleware.js

const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '認証トークンが必要です' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'トークンが無効です' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'トークンが無効または期限切れです' });
  }
};
