CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT,
  dzongkhag TEXT,
  gewog TEXT,
  address TEXT,
  education TEXT,
  institution TEXT,
  field_of_study TEXT,
  preference TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  dzongkhag TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  website TEXT,
  representative TEXT,
  logo_stored_name TEXT,
  logo_mime_type TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  partnership_status TEXT NOT NULL DEFAULT 'inactive' CHECK (partnership_status IN ('active', 'inactive', 'archived')),
  last_confirmation_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_stored_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_mime_type TEXT;

CREATE TABLE IF NOT EXISTS company_contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_partnerships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'inactive', 'archived')),
  confirmed_at DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_communication_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  admin_id BIGINT NOT NULL REFERENCES users(id),
  contact_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL CHECK (method IN ('phone', 'email', 'in_person', 'other')),
  person_contacted TEXT,
  details TEXT NOT NULL,
  confirmed_opportunities TEXT,
  available_positions INTEGER CHECK (available_positions IS NULL OR available_positions >= 0),
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  communication_id BIGINT REFERENCES company_communication_logs(id),
  uploaded_by BIGINT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  qualifications TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  positions INTEGER NOT NULL DEFAULT 1 CHECK (positions > 0),
  stipend_nu NUMERIC(10, 2) CHECK (stipend_nu IS NULL OR stipend_nu >= 0),
  location TEXT NOT NULL DEFAULT '',
  dzongkhag TEXT NOT NULL DEFAULT '',
  gewog TEXT NOT NULL DEFAULT '',
  internship_type TEXT NOT NULL CHECK (internship_type IN ('short-term', 'long-term', 'vacation', 'part-time', 'full-time', 'flexible')),
  work_arrangement TEXT NOT NULL DEFAULT 'on-site' CHECK (work_arrangement IN ('on-site', 'remote', 'hybrid')),
  working_hours TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  deadline DATE,
  required_documents TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_confirmation', 'published', 'paused', 'filled', 'expired', 'archived')),
  last_confirmed_at DATE,
  last_confirmed_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE internships ADD COLUMN IF NOT EXISTS last_confirmed_at DATE;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS last_confirmed_by BIGINT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS internships_search_idx ON internships(status, category, dzongkhag, internship_type);
CREATE INDEX IF NOT EXISTS internships_company_idx ON internships(company_id, status);

CREATE TABLE IF NOT EXISTS internship_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  internship_id BIGINT NOT NULL REFERENCES internships(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  date_of_birth DATE,
  address TEXT NOT NULL DEFAULT '',
  dzongkhag TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  field_of_study TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  preferred_start_date DATE,
  requested_duration TEXT NOT NULL DEFAULT '',
  cover_letter TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, internship_id)
);
CREATE INDEX IF NOT EXISTS applications_user_idx ON internship_applications(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS applications_status_idx ON internship_applications(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS application_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES internship_applications(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES internship_applications(id),
  changed_by BIGINT NOT NULL REFERENCES users(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internship_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES internship_applications(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  internship_id BIGINT NOT NULL REFERENCES internships(id),
  actual_start_date DATE,
  original_end_date DATE,
  current_end_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE internship_records DROP CONSTRAINT IF EXISTS internship_records_status_check;
ALTER TABLE internship_records ADD CONSTRAINT internship_records_status_check CHECK (status IN ('upcoming', 'active', 'completed', 'ended'));

CREATE TABLE IF NOT EXISTS extension_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES internship_records(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  additional_duration TEXT NOT NULL,
  proposed_end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  company_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  admin_comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE extension_requests ADD COLUMN IF NOT EXISTS company_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS internship_extension_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id BIGINT NOT NULL REFERENCES internship_records(id),
  request_id BIGINT NOT NULL UNIQUE REFERENCES extension_requests(id),
  previous_end_date DATE,
  new_end_date DATE NOT NULL,
  approved_by BIGINT NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  role_target TEXT CHECK (role_target IS NULL OR role_target IN ('user', 'admin')),
  message TEXT NOT NULL,
  href TEXT,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_idx ON notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id BIGINT,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions(expire);

CREATE TABLE IF NOT EXISTS internship_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO internship_categories (name) VALUES
  ('Information Technology'), ('Business Administration'), ('Accounting and Finance'),
  ('Engineering'), ('Tourism and Hospitality'), ('Agriculture'), ('Marketing and Sales'),
  ('Education'), ('Healthcare Administration'), ('Construction'), ('Customer Service'),
  ('Government and Public Administration')
ON CONFLICT (name) DO NOTHING;
