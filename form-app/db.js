const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Locally: npm run db:up, then npm run dev (reads .env)');
  process.exit(1);
}

// A pool keeps a few connections open and reuses them, instead of reconnecting on every request.
// Azure PostgreSQL requires SSL; locally (Docker) we don't use it.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: 5,
});

// Create the table on first run; IF NOT EXISTS makes this safe to run every time
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // One submission per email, ignoring upper/lower case (Test@x.com == test@x.com).
  // The database itself enforces this, so two simultaneous requests can't both get in.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS submissions_email_unique
    ON submissions (lower(email))
  `);
}

module.exports = { pool, init };
