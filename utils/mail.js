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

// ─── Demo: Bestätigungs-E-Mail ────────────────────────────────────────────────
async function sendDemoConfirmationEmail({ to, name, companyName, activationUrl }) {
  const transporter = createTransporter();
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>
  body { font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:0; }
  .container { max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1); }
  .header  { background:#1e293b;padding:24px 32px; }
  .header h1 { color:#fff;font-size:20px;margin:0; }
  .content { padding:32px; }
  .btn { display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px; }
  .footer  { background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#64748b; }
  .highlight { background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;border-radius:4px;margin:18px 0; }
</style></head><body>
<div class="container">
  <div class="header"><h1>IfDAU – Demo-Anfrage bestätigen</h1></div>
  <div class="content">
    <p>Hallo <strong>${name}</strong>,</p>
    <p>vielen Dank für Ihre Demo-Anfrage für <strong>${companyName}</strong>!</p>
    <div class="highlight">
      Bitte klicken Sie auf den folgenden Button, um Ihre E-Mail-Adresse zu bestätigen und Ihren kostenlosen 14-Tage-Demo-Zugang zu aktivieren.
    </div>
    <a href="${activationUrl}" class="btn">Demo jetzt aktivieren</a>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">
      Dieser Link ist 48 Stunden gültig. Falls Sie keine Demo angefragt haben, ignorieren Sie bitte diese E-Mail.
    </p>
  </div>
  <div class="footer">IfDAU – Institut für Digitale Arbeitsunterweisungen<br>Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to,
    subject: `IfDAU Demo – E-Mail-Adresse bestätigen`,
    html
  });
}

// ─── Demo: Willkommens-E-Mail (nach Aktivierung) ───────────────────────────
async function sendDemoWelcomeEmail({ to, name, companyName, password, loginUrl, expiresAt }) {
  const transporter = createTransporter();
  const expiresFormatted = new Date(expiresAt).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>
  body { font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:0; }
  .container { max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1); }
  .header  { background:#1e293b;padding:24px 32px; }
  .header h1 { color:#fff;font-size:20px;margin:0; }
  .content { padding:32px; }
  .btn { display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px; }
  .footer  { background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#64748b; }
  .cred-box { background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:16px 20px;margin:18px 0;font-family:monospace; }
  .cred-box div { margin:4px 0; }
  .badge { display:inline-block;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;padding:3px 10px;font-size:12px;font-weight:700; }
</style></head><body>
<div class="container">
  <div class="header"><h1>IfDAU – Ihr Demo-Zugang ist aktiv!</h1></div>
  <div class="content">
    <p>Hallo <strong>${name}</strong>,</p>
    <p>Ihr 14-Tage-Demo-Zugang für <strong>${companyName}</strong> ist soeben aktiviert worden. <span class="badge">DEMO</span></p>
    <p>Hier sind Ihre Zugangsdaten:</p>
    <div class="cred-box">
      <div><strong>E-Mail:</strong> ${to}</div>
      <div><strong>Passwort:</strong> ${password}</div>
    </div>
    <p>Ihr Demo-Zugang ist gültig bis: <strong>${expiresFormatted}</strong>.</p>
    <p>Sie haben Zugriff auf 3 Demo-Unterweisungen. Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.</p>
    <a href="${loginUrl}" class="btn">Jetzt anmelden</a>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">
      Möchten Sie den vollen Funktionsumfang nutzen? Kontaktieren Sie uns: <a href="mailto:info@ifdau.de">info@ifdau.de</a>
    </p>
  </div>
  <div class="footer">IfDAU – Institut für Digitale Arbeitsunterweisungen<br>Diese E-Mail wurde automatisch generiert.</div>
</div></body></html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to,
    subject: `IfDAU – Ihr Demo-Zugang für ${companyName} ist aktiv`,
    html
  });
}

// ─── Demo: Benachrichtigung an IfDAU-Admin ────────────────────────────────
async function sendDemoNotificationEmail({ companyName, contactName, contactEmail, phone }) {
  const transporter = createTransporter();
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">
<div style="max-width:500px;margin:auto;background:#fff;padding:28px;border-radius:8px;">
  <h2 style="color:#1e293b;">Neue Demo-Anfrage</h2>
  <p><strong>Firma:</strong> ${companyName}</p>
  <p><strong>Ansprechpartner:</strong> ${contactName}</p>
  <p><strong>E-Mail:</strong> ${contactEmail}</p>
  <p><strong>Telefon:</strong> ${phone || '–'}</p>
  <p style="color:#64748b;font-size:13px;margin-top:16px;">Demo-Aktivierungslink wurde per E-Mail versandt.</p>
</div></body></html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to: process.env.ADMIN_EMAIL || 'info@ifdau.de',
    subject: `Neue Demo-Anfrage: ${companyName}`,
    html
  });
}

// ─── Demo: Ablaufwarnung (1 Tag vorher) ───────────────────────────────────
async function sendDemoExpiryWarningEmail({ to, name, companyName, expiresAt }) {
  const transporter = createTransporter();
  const expiresFormatted = new Date(expiresAt).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<style>
  body { font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:0; }
  .container { max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1); }
  .header  { background:#f59e0b;padding:24px 32px; }
  .header h1 { color:#fff;font-size:20px;margin:0; }
  .content { padding:32px; }
  .btn { display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:20px;font-size:15px; }
  .footer  { background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#64748b; }
  .alert-box { background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin:18px 0; }
</style></head><body>
<div class="container">
  <div class="header"><h1>IfDAU – Ihr Demo-Zugang läuft morgen ab</h1></div>
  <div class="content">
    <p>Hallo <strong>${name}</strong>,</p>
    <div class="alert-box">
      Ihr Demo-Zugang für <strong>${companyName}</strong> läuft am <strong>${expiresFormatted}</strong> ab.
    </div>
    <p>Um den vollen Funktionsumfang weiterhin zu nutzen, nehmen Sie bitte Kontakt mit uns auf:</p>
    <a href="mailto:info@ifdau.de" class="btn">info@ifdau.de schreiben</a>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">Ihr Demo-Zugang und alle gespeicherten Daten werden nach Ablauf automatisch gelöscht.</p>
  </div>
  <div class="footer">IfDAU – Institut für Digitale Arbeitsunterweisungen</div>
</div></body></html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to,
    subject: `IfDAU – Ihr Demo-Zugang läuft morgen ab`,
    html
  });
}

// ─── Demo: Kontaktanfrage (Freemail-Nutzer) ───────────────────────────────
async function sendDemoInquiryEmail({ name, company, email, message }) {
  const transporter = createTransporter();
  const html = `
<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;">
<div style="max-width:500px;margin:auto;background:#fff;padding:28px;border-radius:8px;">
  <h2 style="color:#1e293b;">Neue Kontaktanfrage (Demo-Seite)</h2>
  <p><strong>Name:</strong> ${name}</p>
  <p><strong>Firma:</strong> ${company}</p>
  <p><strong>E-Mail:</strong> ${email}</p>
  <p><strong>Nachricht:</strong></p>
  <p style="background:#f8fafc;padding:12px;border-radius:4px;">${message || '–'}</p>
</div></body></html>`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'IfDAU <noreply@ifdau.de>',
    to: process.env.ADMIN_EMAIL || 'info@ifdau.de',
    replyTo: email,
    subject: `Demo-Kontaktanfrage: ${company} (${name})`,
    html
  });
}

module.exports = {
  sendReminderEmail,
  sendPasswordResetEmail,
  sendDemoConfirmationEmail,
  sendDemoWelcomeEmail,
  sendDemoNotificationEmail,
  sendDemoExpiryWarningEmail,
  sendDemoInquiryEmail
};
