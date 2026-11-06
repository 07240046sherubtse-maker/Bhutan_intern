const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

async function runScheduledReminders(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO notifications (role_target, message, href, dedupe_key)
       SELECT 'admin',
              'Company follow-up due: ' || followups.name || ' (due ' || followups.follow_up_date || ').',
              '/admin/companies/' || followups.company_id || '/edit',
              'company-follow-up:' || followups.id || ':' || followups.follow_up_date
       FROM (
         SELECT DISTINCT ON (l.company_id) l.id, l.company_id, c.name, l.follow_up_date
         FROM company_communication_logs l
         JOIN companies c ON c.id = l.company_id
         WHERE l.follow_up_date IS NOT NULL AND c.partnership_status <> 'archived'
         ORDER BY l.company_id, l.created_at DESC, l.id DESC
       ) followups
       WHERE followups.follow_up_date <= CURRENT_DATE
       ON CONFLICT (dedupe_key) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO notifications (role_target, message, href, dedupe_key)
       SELECT 'admin',
              'Application ' || a.id || ' has been awaiting review for at least 3 days.',
              '/admin/applications/' || a.id,
              'application-review:' || a.id
       FROM internship_applications a
       WHERE a.status = 'pending' AND a.submitted_at <= NOW() - INTERVAL '3 days'
       ON CONFLICT (dedupe_key) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO notifications (role_target, message, href, dedupe_key)
       SELECT 'admin',
              'Internship deadline approaching: ' || i.title || ' (' || i.deadline || ').',
              '/admin/internships/' || i.id || '/edit',
              'internship-deadline:' || i.id || ':' || i.deadline
       FROM internships i
       WHERE i.status = 'published'
         AND i.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
       ON CONFLICT (dedupe_key) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO notifications (role_target, message, href, dedupe_key)
       SELECT 'admin',
              'Active internship ending soon: ' || i.title || ' (' || r.current_end_date || ').',
              '/admin/interns',
              'internship-end:' || r.id || ':' || r.current_end_date
       FROM internship_records r
       JOIN internships i ON i.id = r.internship_id
       WHERE r.status = 'active'
         AND r.current_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
       ON CONFLICT (dedupe_key) DO NOTHING`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function startReminderScheduler(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledReminders(pool);
    } catch (error) {
      console.error("Scheduled reminder run failed:", error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, REMINDER_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { runScheduledReminders, startReminderScheduler };
