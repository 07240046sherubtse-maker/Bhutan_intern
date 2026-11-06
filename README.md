# Bhutan InternshipLink

A Node.js, Express, EJS and PostgreSQL internship platform for Bhutan. Public
company and opportunity pages show only verified, active organisations and
published openings. Administrator accounts are created from the command line;
users register through the website.

## Requirements

- Node.js 20 or newer
- PostgreSQL (Neon is supported)

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create `.env` and configure PostgreSQL with either `DATABASE_URL` or the
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` settings. Replace
   `SESSION_SECRET` with a long random secret. Keep `.env` private; it is
   ignored by Git.

3. Create the tables and categories:

   ```powershell
   npm run db:migrate
   ```

4. Optionally set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PHONE` in `.env` to
   prefill the administrator account details. Create the account in an
   interactive terminal; its password is entered without being echoed. If a
   password has already been temporarily set as `ADMIN_PASSWORD` in `.env`,
   setup uses it once and removes that line after successfully creating the
   account:

   ```powershell
   npm run create-admin
   ```

   The setup script accepts at most two administrator accounts and hashes
   passwords with bcrypt. It never writes a password to the database or logs.

5. Start the website:

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000>. Use `npm start` for a normal server process.
   Users register at `/register`; administrators sign in at `/admin/login`.

## Database and uploads

Run `npm run db:migrate` when preparing a new database. The migration is safe to
run again and seeds internship categories only; it does not invent companies or
vacancies.

Application documents are written outside the public web root to
`private_uploads/` by default. For Render, attach persistent private storage and
set `PRIVATE_UPLOAD_DIR` to its mount path. The default Render filesystem is
ephemeral and is not suitable for permanent application documents. Documents
are served only after an ownership or administrator authorization check.
For S3-compatible private storage, set `S3_BUCKET` and `S3_REGION`; credentials
can be supplied with `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` or through the
AWS runtime role. Set `S3_ENDPOINT` for compatible providers such as Cloudflare
R2 or MinIO. Existing local uploads remain available locally; migrate them
before switching a deployed application to object storage.

For local PostgreSQL without TLS, set `DATABASE_SSL=false`; leave TLS enabled for
Neon. In production, set `NODE_ENV=production`, a strong `SESSION_SECRET`, and
`TRUST_PROXY=true` when the deployment is behind a trusted proxy.
Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optionally `SMTP_USER` and
`SMTP_PASSWORD`. For Gmail, `EMAIL_USER` and `EMAIL_APP_PASSWORD` can be used
instead; Gmail SMTP defaults to `smtp.gmail.com:587`. Email verification is
enabled automatically when outbound email is configured, unless explicitly
disabled with `EMAIL_VERIFICATION_REQUIRED=false`. Production
requires SMTP and email verification; local environments can leave email
verification disabled until a mail server is configured. Password reset and
verification tokens are one-use, hashed in the database, and expire.

## Implemented workflows

- User registration/login and separate administrator login; session storage in
  PostgreSQL, role checks, CSRF protection, login rate limits, email
  verification with expiring six-digit codes, and password recovery using
  one-time six-digit codes.
- Search/filter, detail pages and directory pages for verified active
  organisations and published opportunities.
- Administrator-managed companies, partnership verification, communication
  history, internship listings and confirmation-required publishing.
- Internship applications, duplicate prevention, private document uploads and
  downloads, status history, user cancellation and administrator decisions.
- Internship records, extension requests with recorded company confirmation,
  internal notifications, dashboards, profile/password settings, and CSV
  application export.
- PDF platform reports and hourly in-app reminders for overdue company
  follow-ups, applications awaiting review, upcoming opportunity deadlines,
  and active internship end dates.
- Responsive layouts for mobile, tablet and desktop.

## Application structure

- `routes/` maps URLs and middleware to controller actions.
- `controllers/` handles public pages, company and internship pages, seeker
  pages, administrator pages and reports, and account registration/sign-in.
- `models/` contains database queries for published opportunities, companies,
  applications, internship records, extensions, notifications, reports, and
  role-specific dashboards.
- `services/` contains email, token, reminder and upload-storage integrations.
- `database/` defines the PostgreSQL schema, migrations and admin setup.
- `views/` contains the EJS user interface; `public/` contains CSS and
  JavaScript assets.

Company logos and supporting partnership documents use the same private
storage adapter; verified partner logos are served through an access-checked
public image route. Scheduled reminders are in-app admin notifications; they
do not send email.

## Validation

```powershell
npm run check
npm test
npm audit
```
