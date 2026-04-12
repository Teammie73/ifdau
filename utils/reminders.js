const pool = require('../db/connection');
const { sendReminderEmail } = require('./mail');

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

function scheduleReminders() {
  // Run immediately on start
  checkAndSendReminders();
  // Run every hour
  setInterval(checkAndSendReminders, 60 * 60 * 1000);
  console.log('Erinnerungs-Scheduler gestartet (stündlich).');
}

module.exports = { scheduleReminders, checkAndSendReminders };
