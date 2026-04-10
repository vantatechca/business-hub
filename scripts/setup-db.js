#!/usr/bin/env node
/**
 * Business Hub V2 — Database Setup Script
 *
 * Usage:  node scripts/setup-db.js
 * Requires DATABASE_URL in .env.local or the environment.
 *
 * What it does:
 *   1. Runs scripts/migrate.sql (core schema — idempotent)
 *   2. Detects the actual `departments.id` column type at runtime
 *   3. Runs additive migrations with FKs that MATCH the detected type
 *      (so deployments whose departments.id is TEXT don't fail the same
 *       way deployments with UUID ids do)
 *
 * What it does NOT do:
 *   - Seed any rows. Pass `--with-seed` to also run scripts/seed.sql.
 *     Without the flag we leave the tables empty and the app creates
 *     real data through the UI.
 */

const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}

const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL not found in .env.local");
  console.error("    Add: DATABASE_URL=postgresql://user:pass@host/db?sslmode=require");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const withSeed = process.argv.includes("--with-seed");

// The @neondatabase/serverless `sql` tagged-template function also accepts a
// direct plain-string call for queries without parameters.
async function execRaw(statement) {
  return sql(statement);
}

// Strip comment-only lines from each chunk, then split on `;\n`.
const split = (sqlText) =>
  sqlText
    .split(/;\s*\n/)
    .map(chunk =>
      chunk
        .split("\n")
        .filter(line => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(s => s.length > 5);

async function runFile(label, filename) {
  const text = fs.readFileSync(path.join(__dirname, filename), "utf8");
  const stmts = split(text);
  let ok = 0;
  const silent = /* errors to not log */ [
    "already exists",
    "duplicate key",
    "conflict",
  ];
  console.log(`📐  ${label}…`);
  for (const stmt of stmts) {
    try {
      await execRaw(stmt);
      ok++;
      process.stdout.write(".");
    } catch (e) {
      const msg = String(e.message || "");
      if (!silent.some(s => msg.includes(s))) {
        console.error("\n⚠️  " + label + " warning:", msg.slice(0, 200));
      }
    }
  }
  console.log(`\n✅  ${label} complete (${ok}/${stmts.length} ok)\n`);
}

// Detect the actual PostgreSQL type of departments.id so the additive
// migrations can build matching-type columns/FKs.
async function detectDeptIdType() {
  const rows = await sql(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'departments' AND column_name = 'id'
  `);
  if (!rows.length) {
    throw new Error("departments table not found — run migrate.sql first");
  }
  const udt = String(rows[0].udt_name || "").toLowerCase();
  // Postgres reports uuid as udt_name 'uuid', text as 'text', varchar as 'varchar', etc.
  if (udt === "uuid") return "UUID";
  if (udt === "text") return "TEXT";
  if (udt.startsWith("varchar")) return "VARCHAR(255)";
  // Fallback: match the reported data type directly
  return String(rows[0].data_type || "TEXT").toUpperCase();
}

async function addFkIfMissing(tableName, columnName, constraintName, refTable, refCol) {
  const rows = await sql(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = '${constraintName}' AND table_name = '${tableName}'
  `);
  if (rows.length) return false;
  try {
    await sql(`
      ALTER TABLE ${tableName}
      ADD CONSTRAINT ${constraintName}
      FOREIGN KEY (${columnName}) REFERENCES ${refTable}(${refCol}) ON DELETE SET NULL
    `);
    return true;
  } catch (e) {
    console.warn(`⚠️  Could not add ${constraintName}: ${String(e.message || "").slice(0, 160)}`);
    return false;
  }
}

async function runAdditiveMigrations() {
  console.log("📐  Additive migrations…");

  const deptIdType = await detectDeptIdType();
  console.log(`    detected departments.id type: ${deptIdType}`);

  const stmts = [
    // User columns
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id ${deptIdType}`,

    // ── v2: 5-tier role system, super admin, profile, audit, checkin review
    // Role check constraint is dropped/re-added because the original table
    // only allowed admin/leader/member. A dedicated helper later migrates
    // any existing 'leader' rows to 'manager'.
    `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin','admin','manager','lead','member','leader'))`,

    // Force password change on first login (true by default for new users)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE`,

    // Per-user toggles (default on for managers — enforced in POST /api/users)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_checkin BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_notifications BOOLEAN DEFAULT FALSE`,

    // Profile fields (self-editable)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS hobbies TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_quote TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns TEXT`,

    // Existing leaders become managers (they had review power under the old
    // 3-role system; manager is the new equivalent). Idempotent.
    `UPDATE users SET role = 'manager' WHERE role = 'leader'`,
    // After migrating data, tighten the constraint to exclude 'leader'
    `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin','admin','manager','lead','member'))`,

    // Existing managers default to requires_checkin + birthday_notifications
    // (only runs once — later rows flipped by app logic won't be touched
    // because the default flips are only for the "manager" role and the
    // UPDATE is restricted to rows where both fields are still the default).
    `UPDATE users SET requires_checkin = TRUE, birthday_notifications = TRUE WHERE role = 'manager' AND requires_checkin = FALSE AND birthday_notifications = FALSE`,

    // ── Multi-department junction table
    // Users can belong to multiple departments. role_in_dept differentiates
    // a Lead from a Member within a specific department. The primary
    // department_id column on users is kept as a "primary" hint.
    `CREATE TABLE IF NOT EXISTS user_departments (
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      department_id ${deptIdType} NOT NULL,
      role_in_dept  VARCHAR(20) DEFAULT 'member' CHECK (role_in_dept IN ('lead','member')),
      created_at    TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, department_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_departments_user ON user_departments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON user_departments(department_id)`,

    // Backfill: copy existing users.department_id rows into the junction
    // table once (ON CONFLICT DO NOTHING makes it idempotent). New users
    // written after this migration ran should write directly to the junction.
    `INSERT INTO user_departments (user_id, department_id, role_in_dept)
     SELECT u.id, u.department_id,
            CASE WHEN u.role = 'lead' THEN 'lead' ELSE 'member' END
     FROM users u
     WHERE u.department_id IS NOT NULL
     ON CONFLICT (user_id, department_id) DO NOTHING`,

    // ── Audit log
    // Used for auth events, CRUD operations, and check-in reviews. Retention
    // is manual: super_admin can bulk-delete by date range from the audit
    // page.
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id           BIGSERIAL PRIMARY KEY,
      occurred_at  TIMESTAMPTZ DEFAULT NOW(),
      actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_email  TEXT,
      actor_role   TEXT,
      action       TEXT NOT NULL,
      entity_type  TEXT,
      entity_id    TEXT,
      ip           TEXT,
      user_agent   TEXT,
      metadata     JSONB
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,

    // ── Check-in review audit
    `ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    `ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

    // ── Notifications: alerts/issues integration
    // The notifications table is repurposed for admin-sent alerts (one row
    // per recipient). Existing rows are unaffected; we just add a few
    // columns and widen the type CHECK.
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info'`,
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_severity_check`,
    `ALTER TABLE notifications ADD CONSTRAINT notifications_severity_check CHECK (severity IN ('info','warning','critical'))`,
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
    `ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('checkin_reminder','missed_checkin','metric_alert','ai_flag','stalled_metric','priority_change','weekly_summary','api_sync_error','system','alert','issue_update','birthday'))`,

    // ── Issues
    // Two categories:
    //   system → only admin / super_admin can see/resolve
    //   work   → admin / manager / lead / super_admin can see/resolve
    // Reporter always sees their own issues regardless of category.
    `CREATE TABLE IF NOT EXISTS issues (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category         VARCHAR(20) NOT NULL CHECK (category IN ('system','work')),
      title            TEXT NOT NULL,
      description      TEXT,
      status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
      assignee_id      UUID REFERENCES users(id) ON DELETE SET NULL,
      resolver_id      UUID REFERENCES users(id) ON DELETE SET NULL,
      resolution_notes TEXT,
      archived         BOOLEAN DEFAULT FALSE,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      resolved_at      TIMESTAMPTZ,
      archived_at      TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_issues_reporter ON issues(reporter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_archived ON issues(archived)`,

    // ── Hard-delete user safety
    // The original schema declared several FK columns to users(id) WITHOUT
    // an ON DELETE clause, which defaults to NO ACTION and blocks deletion.
    // We now hard-delete users instead of soft-deactivating, so re-create
    // the constraints with ON DELETE SET NULL (or CASCADE for tightly coupled
    // rows) so historical data stays put while the user row goes away.
    `ALTER TABLE metric_assignments DROP CONSTRAINT IF EXISTS metric_assignments_assigned_by_fkey`,
    `ALTER TABLE metric_assignments ADD CONSTRAINT metric_assignments_assigned_by_fkey
       FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE daily_checkins DROP CONSTRAINT IF EXISTS daily_checkins_reviewed_by_fkey`,
    `ALTER TABLE daily_checkins ADD CONSTRAINT daily_checkins_reviewed_by_fkey
       FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE metric_updates DROP CONSTRAINT IF EXISTS metric_updates_user_id_fkey`,
    `ALTER TABLE metric_updates ADD CONSTRAINT metric_updates_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE login_messages DROP CONSTRAINT IF EXISTS login_messages_from_user_id_fkey`,
    `ALTER TABLE login_messages ADD CONSTRAINT login_messages_from_user_id_fkey
       FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE`,

    // Metrics — optional due date. When set, notifications (separate feature)
    // ping assignees at T-7d / T-3d / T-0 until the metric is marked complete.
    `ALTER TABLE metrics ADD COLUMN IF NOT EXISTS due_date DATE`,

    // Goals — optional free-text notes shown on the goal card and in the
    // update modal.
    `ALTER TABLE goals ADD COLUMN IF NOT EXISTS notes TEXT`,
    // Goals — stored currency (USD/CAD) for goals with format='currency'.
    `ALTER TABLE goals ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD'`,
    // Tasks — extended fields for rich task tracking.
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) DEFAULT 'one-time'`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS goal_value DECIMAL DEFAULT 0`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_value DECIMAL DEFAULT 0`,
    // Investors — birthday and notification flag so managers can track
    // investor birthdays alongside employees.
    `ALTER TABLE investors ADD COLUMN IF NOT EXISTS birthday DATE`,
    `ALTER TABLE investors ADD COLUMN IF NOT EXISTS birthday_notifications BOOLEAN DEFAULT FALSE`,

    // Departments — free-text notes shown on the department detail page.
    // Replaces the old "health" field in the edit form.
    `ALTER TABLE departments ADD COLUMN IF NOT EXISTS notes TEXT`,

    // Tasks
    `CREATE TABLE IF NOT EXISTS tasks (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title         VARCHAR(500) NOT NULL,
      priority      VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
      status        VARCHAR(20) NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','in-progress','done')),
      department_id ${deptIdType},
      assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
      due_date      DATE,
      sort_order    INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`,

    // Goals / OKRs
    `CREATE TABLE IF NOT EXISTS goals (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255) NOT NULL,
      target     DECIMAL NOT NULL DEFAULT 0,
      current    DECIMAL NOT NULL DEFAULT 0,
      format     VARCHAR(20) NOT NULL DEFAULT 'number' CHECK (format IN ('number','currency','percent')),
      color      VARCHAR(10) NOT NULL DEFAULT '#5b8ef8',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    // Revenue
    `CREATE TABLE IF NOT EXISTS revenue_entries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      amount        DECIMAL NOT NULL DEFAULT 0,
      department_id ${deptIdType},
      description   TEXT,
      month         VARCHAR(3),
      year          INTEGER,
      created_at    TIMESTAMP DEFAULT NOW()
    )`,

    // Expenses
    `CREATE TABLE IF NOT EXISTS expense_entries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      amount        DECIMAL NOT NULL DEFAULT 0,
      department_id ${deptIdType},
      description   TEXT,
      month         VARCHAR(3),
      year          INTEGER,
      created_at    TIMESTAMP DEFAULT NOW()
    )`,

    // Per-entry currency. USD is the canonical storage currency; the UI
    // converts at render time when the user switches global currency.
    `ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD'`,
    `ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD'`,
    // Full date field for precise entry dating (vs just month/year).
    `ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS entry_date DATE`,
    `ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS entry_date DATE`,
  ];

  let ok = 0;
  for (const stmt of stmts) {
    try {
      await sql(stmt);
      ok++;
      process.stdout.write(".");
    } catch (e) {
      const msg = String(e.message || "");
      if (!msg.includes("already exists") && !msg.includes("duplicate")) {
        console.error("\n⚠️  Additive warning:", msg.slice(0, 200));
      }
    }
  }

  // Add the FKs separately. ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS,
  // so we check information_schema first.
  console.log("\n    adding foreign keys…");
  const fkOk = [];
  if (await addFkIfMissing("users", "department_id", "users_department_id_fkey", "departments", "id")) fkOk.push("users.department_id");
  if (await addFkIfMissing("tasks", "department_id", "tasks_department_id_fkey", "departments", "id")) fkOk.push("tasks.department_id");
  if (await addFkIfMissing("revenue_entries", "department_id", "revenue_entries_department_id_fkey", "departments", "id")) fkOk.push("revenue_entries.department_id");
  if (await addFkIfMissing("expense_entries", "department_id", "expense_entries_department_id_fkey", "departments", "id")) fkOk.push("expense_entries.department_id");
  if (fkOk.length) console.log("    added FKs:", fkOk.join(", "));
  else console.log("    (no new FKs needed)");

  console.log(`\n✅  Additive migrations complete (${ok}/${stmts.length} statements ok)\n`);
}

// Idempotent — only creates the super admin if it doesn't already exist.
// The account is hidden from every other user via the stealth filter in
// lib/authz.ts. The password is intentionally weak because must_change_password
// is set to TRUE — the first login forces a password change.
async function bootstrapSuperAdmin() {
  console.log("📐  Super admin bootstrap…");
  const email = "super-admin@godview.com";
  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length) {
      console.log("    super admin already exists — skipping\n");
      return;
    }
    const hash = await bcrypt.hash("temp123", 10);
    await sql`
      INSERT INTO users (email, name, password_hash, role, timezone, is_active, must_change_password)
      VALUES (${email}, ${"Super Admin"}, ${hash}, ${"super_admin"}, ${"America/Toronto"}, TRUE, TRUE)
    `;
    console.log("    ✓ created super-admin@godview.com (temp password: temp123)\n");
  } catch (e) {
    console.error("⚠️  super admin bootstrap failed:", String(e.message || "").slice(0, 200));
  }
}

async function run() {
  console.log("🚀  Business Hub V2 — Database Setup\n");

  await runFile("Core migrations", "migrate.sql");
  await runAdditiveMigrations();
  await bootstrapSuperAdmin();

  if (withSeed) {
    await runFile("Seed data", "seed.sql");
  } else {
    console.log("⏭   Skipping seed data (pass --with-seed to include it)\n");
  }

  // Verify counts
  const [depts]   = await sql`SELECT COUNT(*) FROM departments`;
  const [metrics] = await sql`SELECT COUNT(*) FROM metrics`;
  const [users]   = await sql`SELECT COUNT(*) FROM users`;
  const [tasks]   = await sql`SELECT COUNT(*) FROM tasks`;
  const [goals]   = await sql`SELECT COUNT(*) FROM goals`;
  const [rev]     = await sql`SELECT COUNT(*) FROM revenue_entries`;
  const [exp]     = await sql`SELECT COUNT(*) FROM expense_entries`;

  console.log("📊  Database summary:");
  console.log(`    Departments:      ${depts.count}`);
  console.log(`    Metrics:          ${metrics.count}`);
  console.log(`    Users:            ${users.count}`);
  console.log(`    Tasks:            ${tasks.count}`);
  console.log(`    Goals:            ${goals.count}`);
  console.log(`    Revenue entries:  ${rev.count}`);
  console.log(`    Expense entries:  ${exp.count}`);
  console.log("\n🎉  Setup complete!\n");
}

run().catch(err => {
  console.error("❌  Setup failed:", err.message);
  process.exit(1);
});
