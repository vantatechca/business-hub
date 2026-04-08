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

async function run() {
  console.log("🚀  Business Hub V2 — Database Setup\n");

  await runFile("Core migrations", "migrate.sql");
  await runAdditiveMigrations();

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
