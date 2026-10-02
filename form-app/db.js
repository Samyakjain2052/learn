const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Locally: ./data.db. On Azure we set DB_PATH=/home/data/data.db because only /home survives restarts
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// The file is created automatically if it doesn't exist
const db = new Database(dbPath);

// Create the table on first run; IF NOT EXISTS makes this safe to run every time
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
