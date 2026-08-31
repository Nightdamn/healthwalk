// Mailer через SMTP (Yandex Cloud Postbox или любой другой). Пока credentials
// не заданы — работает в log-only режиме: письма пишутся в консоль. Как только
// в .env появятся SMTP_HOST/SMTP_USER/SMTP_PASS — включится реальная отправка.
//
// Yandex Cloud Postbox (SES-совместимый):
//   SMTP_HOST=postbox.cloud.yandex.net
//   SMTP_PORT=587
//   SMTP_SECURE=false                 (STARTTLS — не implicit TLS)
//   SMTP_USER=<Access Key ID из IAM>
//   SMTP_PASS=<Secret Access Key>
//   MAIL_FROM="InStep <noreply@instep.expert>"
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // по умолчанию false = STARTTLS для 587
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || 'InStep <noreply@instep.expert>';

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log('[Mailer] SMTP configured:', SMTP_HOST);
} else {
  console.log('[Mailer] SMTP not configured — running in LOG-ONLY mode. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to enable real sending.');
}

async function send({ to, subject, text, html }) {
  if (!transporter) {
    console.log(`[Mailer:LOG] to=${to}\n  subj=${subject}\n  text=${text}`);
    return { ok: true, logged: true };
  }
  try {
    const info = await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendVerificationCode(email, code) {
  return send({
    to: email,
    subject: 'Подтверждение email — InStep',
    text: `Ваш код подтверждения: ${code}\n\nКод действует 15 минут.\n\nЕсли вы не регистрировались — просто игнорируйте это письмо.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #1a1a2e;">Подтверждение email</h2>
        <p>Ваш код подтверждения:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #27ae60; padding: 16px; background: #f5f5f7; border-radius: 12px; text-align: center; margin: 16px 0;">${code}</div>
        <p style="color: #666; font-size: 13px;">Код действует 15 минут. Если вы не регистрировались — просто игнорируйте это письмо.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetCode(email, code) {
  return send({
    to: email,
    subject: 'Восстановление пароля — InStep',
    text: `Код восстановления пароля: ${code}\n\nКод действует 30 минут.\n\nЕсли вы не запрашивали восстановление — просто игнорируйте это письмо.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #1a1a2e;">Восстановление пароля</h2>
        <p>Код для установки нового пароля:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #27ae60; padding: 16px; background: #f5f5f7; border-radius: 12px; text-align: center; margin: 16px 0;">${code}</div>
        <p style="color: #666; font-size: 13px;">Код действует 30 минут. Если вы не запрашивали восстановление — просто игнорируйте это письмо.</p>
      </div>
    `,
  });
}

export default { sendVerificationCode, sendPasswordResetCode };
