const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'localhost',
    port: parseInt(process.env.MAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.MAIL_USER || '',
      pass: process.env.MAIL_PASS || ''
    },
    tls: { rejectUnauthorized: false }
  });
}

async function sendReminderEmail({ to, name, trainingTitle, dueDate, daysLeft }) {
  const transporter = createTransporter();
  const dueDateFormatted = new Date(dueDate).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1e293b; padding: 24px 32px; display: flex; align-items: center; }
    .logo-circle { width: 48px; height: 48px; background: #dc2626; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
    .header h1 { color: white; font-size: 20px; margin: 0 0 0 16px; }
    .content { padding: 32px; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 20px 0; }
    .btn { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 16px 32px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-circle" style="text-align:center;line-height:48px;color:white;font-weight:bold;">If</div>
      <h1>IfDAU – Erinnerung</h1>
    </div>
    <div class="content">
      <p>Hallo <strong>${name}</strong>,</p>
      <div class="alert-box">
        <strong>Erinnerung:</strong> Die folgende Unterweisung ist in <strong>${daysLeft} Tagen</strong> fällig.
      </div>
      <p><strong>Unterweisung:</strong> ${trainingTitle}<br>
      <strong>Fälligkeitsdatum:</strong> ${dueDateFormatted}</p>
      <p>Bitte melden Sie sich im IfDAU-Portal an und schließen Sie die Unterweisung rechtzeitig ab.</p>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard" class="btn">Zur Unterweisung</a>
    </div>
    <div class="footer">
      IfDAU – Institut für Digitale Arbeitsunterweisungen<br>
      Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to,
    subject: `Erinnerung: Unterweisung "${trainingTitle}" in ${daysLeft} Tagen fällig`,
    html
  });
}

async function sendPasswordResetEmail({ to, name, resetToken }) {
  const transporter = createTransporter();
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:500px;margin:auto;background:white;padding:32px;border-radius:8px;">
    <h2 style="color:#1e293b;">Passwort zurücksetzen</h2>
    <p>Hallo ${name},</p>
    <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Klicken Sie auf den Button:</p>
    <a href="${resetUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Passwort zurücksetzen</a>
    <p style="color:#64748b;margin-top:20px;font-size:12px;">Dieser Link ist 1 Stunde gültig. Falls Sie keine Anfrage gestellt haben, ignorieren Sie diese E-Mail.</p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to,
    subject: 'IfDAU – Passwort zurücksetzen',
    html
  });
}

module.exports = { sendReminderEmail, sendPasswordResetEmail };
