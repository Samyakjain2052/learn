// Smoke test: starts the real server on a throwaway port against a separate TEST database,
// then calls the API. Needs Postgres running: npm run db:up (CI starts its own).
// Run with: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

// Always the test database, never the dev one, even if DATABASE_URL is set in the shell
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/form_app_test';
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const AUTH = 'Basic ' + Buffer.from('admin:test-password').toString('base64');
const WRONG_AUTH = 'Basic ' + Buffer.from('admin:wrong').toString('base64');

let server;
let pool;

const post = (body) =>
  fetch(`${BASE}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

before(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: TEST_DB_URL,
      DATABASE_SSL: 'false',
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'test-password',
    },
    stdio: 'ignore',
  });

  // Wait until the server answers (max ~10s); it creates the table on startup
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE);
      await pool.query('TRUNCATE submissions RESTART IDENTITY'); // start every run from empty
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Server did not start');
});

after(async () => {
  server.kill();
  await pool.end();
});

test('form page is public', async () => {
  const res = await fetch(BASE);
  assert.strictEqual(res.status, 200);
});

test('invalid submission is rejected with field errors (400)', async () => {
  const res = await post({ name: '', email: 'bad', message: '' });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.errors.name && body.errors.email && body.errors.message);
});

test('valid submission is saved (201) and shows up for admin', async () => {
  const res = await post({ name: 'CI Test', email: 'ci@example.com', message: 'hello' });
  assert.strictEqual(res.status, 201);

  const list = await fetch(`${BASE}/api/submissions`, { headers: { Authorization: AUTH } });
  assert.strictEqual(list.status, 200);
  const rows = await list.json();
  assert.ok(rows.some((r) => r.name === 'CI Test'));
});

test('SQL injection text is stored as plain text, table survives', async () => {
  const evil = "x'); DROP TABLE submissions;--";
  const res = await post({ name: evil, email: 'a@b.co', message: 'm' });
  assert.strictEqual(res.status, 201);
  const list = await fetch(`${BASE}/api/submissions`, { headers: { Authorization: AUTH } });
  const rows = await list.json();
  assert.ok(rows.some((r) => r.name === evil));
});

test('admin routes require the right login (401 otherwise)', async () => {
  assert.strictEqual((await fetch(`${BASE}/admin`)).status, 401);
  assert.strictEqual((await fetch(`${BASE}/api/submissions`)).status, 401);
  const wrong = await fetch(`${BASE}/api/submissions`, { headers: { Authorization: WRONG_AUTH } });
  assert.strictEqual(wrong.status, 401);
});

test('admin.html is not exposed as a static file', async () => {
  assert.strictEqual((await fetch(`${BASE}/admin.html`)).status, 404);
});
