// sensor-server/middleware/requireAuth.js
const jwt = require('jsonwebtoken');

/**
 * ユーザーが許可ロールのいずれかを持つか判定（roles配列優先、なければ単一role）
 */
function hasAnyRole(user, allowed = []) {
  if (!allowed || allowed.length === 0) return true; // ロール未指定なら通す
  const roles = Array.isArray(user?.roles) && user.roles.length
    ? user.roles
    : (user?.role ? [user.role] : []);
  return roles.some(r => allowed.includes(r));
}

/**
 * 実体ミドルウェア（allowedRoles を固定したインスタンス）
 */
function makeMiddleware(allowedRoles = []) {
  return (req, res, next) => {
    try {
      // 1) Authorization: Bearer <token> から取り出し
      const authHeader = req.headers['authorization'] || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      // 2) Cookie セッション対応（任意）
      const cookieToken = req.cookies?.auth_token;

      const token = bearer || cookieToken;
      if (!token) {
        console.warn('🟡 トークンが送られていません');
        return res.status(401).json({ error: '認証トークンがありません' });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('❌ JWT_SECRET が未設定です');
        return res.status(500).json({ error: 'サーバー設定エラー（JWT）' });
      }

      const decoded = jwt.verify(token, secret);
      req.user = decoded; // { id, email, roles?, role? ... }

      if (!hasAnyRole(req.user, allowedRoles)) {
        return res.status(403).json({ error: '権限がありません' });
      }

      return next();
    } catch (err) {
      console.error('❌ JWT検証エラー:', err.message);
      return res.status(401).json({ error: '無効なトークンです' });
    }
  };
}

/**
 * エクスポート関数
 * - 使い方1: app.use('/path', requireAuth)                     // ロール無指定
 * - 使い方2: app.use('/path', requireAuth(['admin','editor'])) // 許可ロール指定
 * - 使い方3: const mw = requireAuth(['admin']); app.get(..., mw, handler)
 *
 * 引数に (req,res,next) が来たときは従来通りのミドルウェアとして扱う（後方互換）。
 */
function requireAuth(arg) {
  // 後方互換: 直接 (req,res,next) が渡ってきたらロール無しで実行
  if (typeof arg === 'function' || typeof arg === 'object') {
    // Express がミドルウェアとして直接渡してきたケース
    // ここでは arg は req なので、ロール無しミドルウェアを返す
    return makeMiddleware(); // 呼び出し側の引数構造を壊さないため
  }
  // 通常: 許可ロールの配列を受け取ってミドルウェアを返す
  const allowedRoles = Array.isArray(arg) ? arg : [];
  return makeMiddleware(allowedRoles);
}

// 補助もエクスポートしておくと便利
requireAuth.hasAnyRole = hasAnyRole;

module.exports = requireAuth;
