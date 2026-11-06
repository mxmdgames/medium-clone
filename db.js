// db.js — the database layer, now on PostgreSQL.
//
// The first version kept everything in one JSON file (data/db.json).
// This version talks to Postgres: a real database server that stores
// tables on disk, answers SQL queries, and enforces rules itself
// (unique usernames, one clap per user, foreign keys).
//
// The rest of the app never writes SQL — it calls the functions below.
// That separation is the point: server.js asks for "the published posts"
// and does not care how they are stored.
//
// Connection: DATABASE_URL from the environment (or .env), defaulting to
// a local database called medium_clone:
//   postgres://localhost:5432/medium_clone

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://localhost:5432/medium_clone',
});

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const WELCOME_POST = {
  title: 'Welcome to your own Medium',
  subtitle: 'This post lives in a Postgres table now — open psql and you can see it.',
  body: [
    '# Hello, and welcome',
    '',
    'You are reading a post that was **never on the internet**. It lives in',
    'a `posts` table in PostgreSQL on your own laptop, and this server —',
    'also on your laptop — turned it into the page you are looking at.',
    '',
    '## Try this',
    '',
    '1. Sign up for an account (top right).',
    '2. Click **Write** and publish your first post.',
    '3. Open a terminal and run `psql -d medium_clone -c "SELECT id, title FROM posts;"` to see your post as a row in a table.',
    '4. Edit the row (`UPDATE posts SET title = ... WHERE id = ...;`), refresh the page, and watch it change.',
    '',
    'That loop — request in, data out, page rendered — is all a web app is.',
    'Everything else is decoration.',
    '',
    '## What to learn next',
    '',
    'Read `README.md` for the guided tour, then `LESSONS.md` when you want',
    'the deeper explanations: how SQL works, what a session row is,',
    'how to add Google sign-in, and how to put this on the internet.',
  ].join('\n'),
};

// Create the tables (from schema.sql) and seed the welcome post once,
// if the posts table is empty. Runs on every server start — it is safe
// to run repeatedly because everything uses IF NOT EXISTS / checks.
async function init() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM posts');
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO posts (author_id, author_name, title, subtitle, body, status)
       VALUES (NULL, $1, $2, $3, $4, 'published')`,
      ['Your Local Server', WELCOME_POST.title, WELCOME_POST.subtitle, WELCOME_POST.body]
    );
  }
}

// Low-level escape hatch: run any SQL. migrate.js uses it; server.js
// should not need it — prefer the functions below.
async function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, username, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query(
    'SELECT id, name, username, password_hash, created_at FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
  return rows[0] || null;
}

async function createUser({ name, username, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, username, created_at`,
    [name, username, passwordHash]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SESSION_DAYS = 7;

async function createSession(userId) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [id, userId, expiresAt]
  );
  return { id, expiresAt };
}

// Look up who a session belongs to. Expired sessions do not count.
async function getSessionUser(sessionId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.username, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId]
  );
  return rows[0] || null;
}

async function deleteSession(sessionId) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

// The shared SELECT: one post row, plus its author and its claps.
// claps is COUNT(*) of the claps table; clapped_by is the list of user ids
// who clapped — the frontend uses it to highlight the clap button.
const POST_SELECT = `
  SELECT p.*,
    u.username AS author_username,
    COALESCE(u.name, p.author_name) AS author_name,
    (SELECT COUNT(*)::int FROM claps c WHERE c.post_id = p.id) AS claps,
    COALESCE((SELECT array_agg(c.user_id) FROM claps c WHERE c.post_id = p.id), '{}') AS clapped_by
  FROM posts p
  LEFT JOIN users u ON u.id = p.author_id
`;

async function listPublishedPosts() {
  const { rows } = await pool.query(
    POST_SELECT + ` WHERE p.status = 'published' ORDER BY p.created_at DESC`
  );
  return rows;
}

async function listUserPosts(userId) {
  const { rows } = await pool.query(
    POST_SELECT + ` WHERE p.author_id = $1 ORDER BY p.created_at DESC`,
    [userId]
  );
  return rows;
}

async function getPost(id) {
  const { rows } = await pool.query(POST_SELECT + ` WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function createPost({ authorId, authorName, title, subtitle, body, status }) {
  const { rows } = await pool.query(
    `INSERT INTO posts (author_id, author_name, title, subtitle, body, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [authorId, authorName, title, subtitle || '', body, status]
  );
  return getPost(rows[0].id);
}

async function updatePost(id, { title, subtitle, body, status }) {
  // COALESCE($n, column) means "only change the fields that were sent".
  const { rows } = await pool.query(
    `UPDATE posts
     SET title = COALESCE($2, title),
         subtitle = COALESCE($3, subtitle),
         body = COALESCE($4, body),
         status = COALESCE($5, status),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, title ?? null, subtitle ?? null, body ?? null, status ?? null]
  );
  if (!rows[0]) return null;
  return getPost(id);
}

async function deletePost(id) {
  await pool.query('DELETE FROM posts WHERE id = $1', [id]);
}

// Clap for a post. ON CONFLICT DO NOTHING + the primary key on
// (post_id, user_id) means a second clap from the same user is a no-op.
async function clapPost(postId, userId) {
  const inserted = await pool.query(
    `INSERT INTO claps (post_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING post_id`,
    [postId, userId]
  );
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM claps WHERE post_id = $1',
    [postId]
  );
  return { claps: rows[0].n, clapped: inserted.rows.length > 0 };
}

module.exports = {
  init,
  query,
  close,
  getUserById,
  getUserByUsername,
  createUser,
  createSession,
  getSessionUser,
  deleteSession,
  listPublishedPosts,
  listUserPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  clapPost,
};
