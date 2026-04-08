-- ============================================================
-- Business Hub V2 — Phase 1 Database Schema
-- Run against your Neon PostgreSQL database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','leader','member')),
  avatar_url    TEXT,
  timezone      VARCHAR(50) DEFAULT 'America/Toronto',
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMP,
  last_checkin_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── DEPARTMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#5b8ef8',
  icon            VARCHAR(10) DEFAULT '📦',
  priority_score  INTEGER DEFAULT 50 CHECK (priority_score BETWEEN 1 AND 100),
  google_sheet_url TEXT,
  description     TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── METRICS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id    UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  metric_type      VARCHAR(20) NOT NULL DEFAULT 'value' CHECK (metric_type IN ('value','daily','value_and_daily')),
  direction        VARCHAR(20) NOT NULL DEFAULT 'higher_better' CHECK (direction IN ('higher_better','lower_better')),
  current_value    DECIMAL DEFAULT 0,
  previous_value   DECIMAL DEFAULT 0,
  thirty_day_total DECIMAL DEFAULT 0,
  target_value     DECIMAL,
  unit             VARCHAR(50) DEFAULT 'count',
  priority_score   INTEGER DEFAULT 50 CHECK (priority_score BETWEEN 1 AND 100),
  notes            TEXT,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ── METRIC ASSIGNMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metric_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id      UUID NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_metric VARCHAR(20) DEFAULT 'contributor' CHECK (role_in_metric IN ('owner','contributor','reviewer')),
  assigned_at    TIMESTAMP DEFAULT NOW(),
  assigned_by    UUID REFERENCES users(id),
  UNIQUE(metric_id, user_id)
);

-- ── DAILY CHECK-INS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_checkins (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  raw_response          TEXT,
  ai_summary            TEXT,
  ai_extracted_metrics  JSONB DEFAULT '[]',
  ai_confidence_score   DECIMAL DEFAULT 0,
  ai_flags              JSONB DEFAULT '[]',
  mood                  VARCHAR(50),
  mood_emoji            VARCHAR(10),
  wins                  TEXT,
  blockers              TEXT,
  status                VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','submitted','ai_processed','reviewed')),
  reviewed_by           UUID REFERENCES users(id),
  reviewer_notes        TEXT,
  submitted_at          TIMESTAMP,
  processed_at          TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, checkin_date)
);

-- ── METRIC UPDATES (audit trail) ─────────────────────────────
CREATE TABLE IF NOT EXISTS metric_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id    UUID NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  checkin_id   UUID REFERENCES daily_checkins(id),
  source       VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('checkin','manual','api_sync','sheets_import')),
  old_value    DECIMAL,
  new_value    DECIMAL,
  delta        DECIMAL GENERATED ALWAYS AS (new_value - old_value) STORED,
  api_verified BOOLEAN DEFAULT FALSE,
  api_source   VARCHAR(100),
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── DAILY PROMPTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_prompts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   UUID REFERENCES departments(id) ON DELETE CASCADE,
  prompt_text     TEXT NOT NULL,
  prompt_type     VARCHAR(30) DEFAULT 'universal' CHECK (prompt_type IN ('universal','department','metric_specific')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL CHECK (type IN ('checkin_reminder','missed_checkin','metric_alert','ai_flag','stalled_metric','priority_change','weekly_summary','api_sync_error','system')),
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  action_url  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── API INTEGRATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  provider              VARCHAR(100) NOT NULL,
  auth_type             VARCHAR(20) CHECK (auth_type IN ('api_key','oauth2','webhook')),
  webhook_url           TEXT,
  webhook_secret        TEXT,
  linked_metrics        JSONB DEFAULT '[]',
  last_sync_at          TIMESTAMP,
  sync_frequency        VARCHAR(50) DEFAULT 'daily',
  status                VARCHAR(20) DEFAULT 'disabled' CHECK (status IN ('active','error','disabled')),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- ── LOGIN MESSAGES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  target_type  VARCHAR(20) CHECK (target_type IN ('everyone','department','leaders','specific_user')),
  target_id    UUID,
  expires_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_metrics_dept ON metrics(department_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON metric_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_metric ON metric_assignments(metric_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON daily_checkins(user_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_metric_updates_metric ON metric_updates(metric_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_depts_priority ON departments(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_priority ON metrics(priority_score DESC);
