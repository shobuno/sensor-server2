// sensor-server/backend/middleware/authenticate.js

const jwt = require('jsonwebtoken');

// .envのJWT_SECRETを使う
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'トークンがありません' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'トークンが無効または期限切れです' });
    }

    req.user = user;
    next();
  });
}

function authorize(requiredRole) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({ error: '権限がありません' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
