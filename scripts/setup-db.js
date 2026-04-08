#!/usr/bin/env node
/**
 * Business Hub V2 — Database Setup Script
 * Usage: node scripts/setup-db.js
 * Requires DATABASE_URL in .env.local
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

async function run() {
  console.log("🚀  Business Hub V2 — Database Setup\n");

  const migrate = fs.readFileSync(path.join(__dirname, "migrate.sql"), "utf8");
  const seed    = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");

  // Split SQL into individual statements
  const split = (sqlText) =>
    sqlText
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 5 && !s.startsWith("--"));

  console.log("📐  Running migrations...");
  const migrateStmts = split(migrate);
  for (const stmt of migrateStmts) {
    try {
      await sql.unsafe(stmt + ";");
      process.stdout.write(".");
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.error("\n⚠️  Migration warning:", e.message.slice(0, 100));
      }
    }
  }
  console.log("\n✅  Migrations complete\n");

  console.log("🌱  Seeding data...");
  const seedStmts = split(seed);
  for (const stmt of seedStmts) {
    try {
      await sql.unsafe(stmt + ";");
      process.stdout.write(".");
    } catch (e) {
      if (!e.message.includes("conflict") && !e.message.includes("duplicate")) {
        console.error("\n⚠️  Seed warning:", e.message.slice(0, 100));
      }
    }
  }
  console.log("\n✅  Seed complete\n");

  // Verify counts
  const [depts]   = await sql`SELECT COUNT(*) FROM departments`;
  const [metrics] = await sql`SELECT COUNT(*) FROM metrics`;
  const [users]   = await sql`SELECT COUNT(*) FROM users`;
  const [assigns] = await sql`SELECT COUNT(*) FROM metric_assignments`;

  console.log("📊  Database summary:");
  console.log(`    Departments:  ${depts.count}`);
  console.log(`    Metrics:      ${metrics.count}`);
  console.log(`    Users:        ${users.count}`);
  console.log(`    Assignments:  ${assigns.count}`);
  console.log("\n🎉  Setup complete! Run: npm run dev\n");
  console.log("    Login credentials:");
  console.log("    Admin:  admin@hub.com     / admin123");
  console.log("    Leader: mathieu@hub.com   / leader123");
  console.log("    Member: renold@hub.com    / member123\n");
}

run().catch(err => {
  console.error("❌  Setup failed:", err.message);
  process.exit(1);
});
