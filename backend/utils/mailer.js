// sensor-server/backend/utils/mailer.js

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === 'true', // MailHogはfalse
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});
async function sendVerificationEmail(to, token, verifyUrl) {
    // ルーター側から verifyUrl が渡されればそれを使う。なければ .env から生成
    const base = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
    const url = verifyUrl || `${base}/verify-email?token=${token}`;

  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'HydroSense <no-reply@shobuno.local>',
    to,
    subject: 'メールアドレスの確認',
    text: `以下のURLを開いて認証を完了してください: ${url}`,
    html: `<p>以下のリンクをクリックして認証を完了してください。</p>
           <p><a href="${url}">${url}</a></p>`,
  });
}

module.exports = { sendVerificationEmail };
