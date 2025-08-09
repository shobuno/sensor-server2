// sensor-server/backend/utils/mailer.js
const nodemailer = require('nodemailer');

// nodemailer トランスポート設定
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'localhost',
  port: Number(process.env.MAIL_PORT || 1025),
  secure: process.env.MAIL_SECURE === 'true', // Mailpitはfalse
  auth: (process.env.MAIL_USER && process.env.MAIL_PASS)
    ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    : undefined,
});

/**
 * メールアドレス確認メール送信
 * @param {string} to - 送信先メールアドレス
 * @param {string} token - 認証用トークン
 * @param {string} [verifyUrl] - カスタムURL（省略時はFRONTEND_BASE_URLから生成）
 */
async function sendVerificationEmail(to, token, verifyUrl) {
  const base = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const url = verifyUrl || `${base}/verify-email?token=${token}`;

  return transporter.sendMail({
    from: process.env.MAIL_FROM || 'HydroSense <no-reply@shobuno.local>',
    to,
    subject: 'メールアドレスの確認',
    text: `以下のURLを開いて認証を完了してください: ${url}`,
    html: `<p>以下のリンクをクリックして認証を完了してください。</p>
           <p><a href="${url}">${url}</a></p>`,
  });
}

module.exports = { sendVerificationEmail };
