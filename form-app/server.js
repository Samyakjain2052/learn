const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Admin credentials come from .env (loaded by `npm start`), never hardcoded
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASSWORD) {
  console.error('ADMIN_USER / ADMIN_PASSWORD missing. Start with: npm start (reads .env)');
  process.exit(1);
}

// Compare secrets without leaking info through response time
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Middleware: runs BEFORE the route handler. If login is wrong, the request stops here.
function requireAdmin(req, res, next) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  }
  // This header makes the browser show its login popup
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).send('Login required');
}

// Azure puts a proxy in front of the app; trust 1 hop so req.ip is the real visitor, not the proxy
app.set('trust proxy', 1);

// Max 5 form submissions per IP per 15 minutes, to stop spam
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, errors: { form: 'Too many submissions, try again later' } },
});

// Parse JSON bodies, and serve everything in /public (index.html, css, js)
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Server-side validation: never trust the browser, anyone can bypass it
function validate({ name, email, message }) {
  const errors = {};
  if (typeof name !== 'string' || !name.trim()) errors.name = 'Name is required';
  else if (name.trim().length > 100) errors.name = 'Name is too long (max 100)';

  if (typeof email !== 'string' || !email.trim()) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Email is not valid';

  if (typeof message !== 'string' || !message.trim()) errors.message = 'Message is required';
  else if (message.trim().length > 1000) errors.message = 'Message is too long (max 1000)';

  return errors;
}

app.post('/api/submit', submitLimiter, async (req, res) => {
  const errors = validate(req.body || {});
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const { name, email, message } = req.body;
  // $1, $2, $3 placeholders keep user input separate from the SQL (prevents SQL injection).
  // await: the query takes time, so we wait for the database before answering.
  await pool.query('INSERT INTO submissions (name, email, message) VALUES ($1, $2, $3)', [
    name.trim(),
    email.trim(),
    message.trim(),
  ]);
  res.status(201).json({ ok: true });
});

// Admin page lives in /private (not /public), so it is only served through this protected route
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

app.get('/api/submissions', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM submissions ORDER BY id DESC');
  res.json(rows);
});

// Express 5 sends any error thrown in an async route here. We log the details
// on the server but never show them to the visitor.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, errors: { form: 'Something went wrong, please try again' } });
});

// Make sure the table exists before accepting requests
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  });
