const pool = require('../db/connection');
const { sendReminderEmail, sendDemoExpiryWarningEmail } = require('./mail');

async function checkAndSendReminders() {
  try {
    // Find assignments due in exactly 7 days that haven't been reminded yet
    const [assignments] = await pool.query(`
      SELECT a.id, a.due_date, a.user_id,
             u.name, u.email,
             t.title
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN trainings t ON t.id = a.training_id
      WHERE a.status = 'open'
        AND a.due_date IS NOT NULL
        AND DATEDIFF(a.due_date, CURDATE()) = 7
        AND NOT EXISTS (
          SELECT 1 FROM reminders r
          WHERE r.assignment_id = a.id AND r.type = '7days'
        )
    `);

    for (const assignment of assignments) {
      try {
        await sendReminderEmail({
          to: assignment.email,
          name: assignment.name,
          trainingTitle: assignment.title,
          dueDate: assignment.due_date,
          daysLeft: 7
        });
        await pool.query(
          'INSERT INTO reminders (assignment_id, type) VALUES (?, ?)',
          [assignment.id, '7days']
        );
        console.log(`Erinnerung gesendet an: ${assignment.email} (${assignment.title})`);
      } catch (mailErr) {
        console.error(`Fehler beim Senden der Erinnerung an ${assignment.email}:`, mailErr.message);
      }
    }

    // Also update overdue assignments
    await pool.query(`
      UPDATE assignments
      SET status = 'overdue'
      WHERE status = 'open'
        AND due_date IS NOT NULL
        AND due_date < CURDATE()
    `);
  } catch (err) {
    console.error('Fehler beim Erinnerungs-Check:', err.message);
  }
}

// ─── Demo-Ablauf prüfen (täglich) ────────────────────────────────────────────
async function checkDemoExpiry() {
  try {
    // 1) Ablaufwarnung: expires_at = morgen, status = 'active', noch keine Warnung gesendet
    const [expiringSoon] = await pool.query(`
      SELECT da.id, da.email, da.contact_name, da.company_name, da.expires_at, da.demo_user_id
      FROM demo_accounts da
      WHERE da.status = 'active'
        AND DATE(da.expires_at) = DATE(DATE_ADD(NOW(), INTERVAL 1 DAY))
        AND NOT EXISTS (
          SELECT 1 FROM reminders r WHERE r.assignment_id = da.id AND r.type = 'demo_expiry_warning'
        )
    `);

    for (const demo of expiringSoon) {
      try {
        await sendDemoExpiryWarningEmail({
          to: demo.email,
          name: demo.contact_name,
          companyName: demo.company_name,
          expiresAt: demo.expires_at
        });
        await pool.query(
          'INSERT INTO reminders (assignment_id, type) VALUES (?, ?)',
          [demo.id, 'demo_expiry_warning']
        );
        console.log(`Demo-Ablaufwarnung gesendet an: ${demo.email}`);
      } catch (mailErr) {
        console.error(`Demo-Ablaufwarnung fehlgeschlagen (${demo.email}):`, mailErr.message);
      }
    }

    // 2) Abgelaufene Demos: expires_at < NOW(), status = 'active' → auf 'expired' setzen
    const [expired] = await pool.query(`
      SELECT id, demo_user_id FROM demo_accounts
      WHERE status = 'active' AND expires_at < NOW()
    `);

    for (const demo of expired) {
      await pool.query("UPDATE demo_accounts SET status = 'expired' WHERE id = ?", [demo.id]);
      if (demo.demo_user_id) {
        await pool.query("UPDATE users SET status = 'inactive' WHERE id = ?", [demo.demo_user_id]);
      }
      console.log(`Demo abgelaufen: demo_account_id=${demo.id}`);
    }

  } catch (err) {
    console.error('Fehler beim Demo-Ablauf-Check:', err.message);
  }
}

function scheduleReminders() {
  // Run immediately on start
  checkAndSendReminders();
  checkDemoExpiry();
  // Run every hour
  setInterval(checkAndSendReminders, 60 * 60 * 1000);
  // Demo-Ablauf täglich prüfen
  setInterval(checkDemoExpiry, 24 * 60 * 60 * 1000);
  console.log('Erinnerungs-Scheduler gestartet (stündlich). Demo-Ablauf-Check täglich.');
}

module.exports = { scheduleReminders, checkAndSendReminders, checkDemoExpiry };
