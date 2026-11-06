// server.js — the whole backend, top to bottom.
//
// How to read this file:
//   1. Setup at the top (imports, app, middleware).
//   2. Helpers in the middle (who is logged in, what a post looks like).
//   3. Routes at the bottom — one block per URL. A "route" is just:
//      "when a request arrives at this URL with this method, run this code."
//
// The database is PostgreSQL now (see db.js). Every route handler is
// async and awaits a db function instead of reading a file.
//
// Run it with:  npm start
// Then open:    http://localhost:3000

require('dotenv').config();
const express = require('express');
const path = require('path');
const { marked } = require('marked');
const db = require('./db');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies, so req.body works on POST/PUT.
app.use(express.json());

// Serve the frontend files in public/ — index.html, style.css, app.js, etc.
// A request for "/" returns public/index.html automatically.
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Find the logged-in user from the session cookie, or null.
// The browser sends the cookie automatically on every request; the
// session id is looked up in the sessions table.
async function getSessionUser(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (!match) return null;
  return db.getSessionUser(match[1]);
}

// Middleware: stop the request unless someone is logged in.
async function requireLogin(req, res, next) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  req.user = user;
  next();
}

function readingTime(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)); // ~200 words per minute
}

// Shape a post row for the API: render Markdown to HTML, and never send
// password hashes (they live on users, not posts, but the rule is worth
// stating: only ever send what the page actually needs).
function publicPost(row) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    bodyHtml: marked.parse(row.body),
    body: row.body,
    status: row.status,
    claps: row.claps,
    clappedBy: row.clapped_by || [],
    author: row.author_username
      ? { username: row.author_username, name: row.author_name }
      : { username: null, name: row.author_name || 'Unknown' },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readingTime: readingTime(row.body),
  };
}

function setSessionCookie(res, session) {
  res.cookie('session_id', session.id, {
    httpOnly: true, // JavaScript in the page cannot read it (protects against XSS theft)
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = await db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: 'That username is taken.' });
  }

  const user = await db.createUser({
    name,
    username,
    passwordHash: auth.hashPassword(password),
  });
  const session = await db.createSession(user.id);

  setSessionCookie(res, session);
  res.status(201).json({ user: { id: user.id, name: user.name, username: user.username } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.getUserByUsername(username || '');
  if (!user || !auth.checkPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  const session = await db.createSession(user.id);
  setSessionCookie(res, session);
  res.json({ user: { id: user.id, name: user.name, username: user.username } });
});

app.post('/api/auth/logout', async (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (match) await db.deleteSession(match[1]);
  res.clearCookie('session_id', { path: '/' });
  res.json({ ok: true });
});

// Who am I right now? The frontend calls this on every page load.
app.get('/api/auth/me', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, name: user.name, username: user.username } });
});

// ---------------------------------------------------------------------------
// Post routes
// ---------------------------------------------------------------------------

// Home feed: published posts, newest first.
app.get('/api/posts', async (req, res) => {
  const posts = await db.listPublishedPosts();
  res.json(posts.map(publicPost));
});

// My posts: drafts and published, mine only.
app.get('/api/posts/mine', requireLogin, async (req, res) => {
  const posts = await db.listUserPosts(req.user.id);
  res.json(posts.map(publicPost));
});

// One post. Drafts are only visible to their author.
app.get('/api/posts/:id', async (req, res) => {
  const post = await db.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.status !== 'published') {
    const user = await getSessionUser(req);
    if (!user || user.id !== post.author_id) {
      return res.status(404).json({ error: 'Post not found.' });
    }
  }
  res.json(publicPost(post));
});

// Write a post.
app.post('/api/posts', requireLogin, async (req, res) => {
  const { title, subtitle, body, status } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }
  const post = await db.createPost({
    authorId: req.user.id,
    authorName: req.user.name,
    title,
    subtitle: subtitle || '',
    body,
    status: status === 'published' ? 'published' : 'draft',
  });
  res.status(201).json(publicPost(post));
});

// Edit my post.
app.put('/api/posts/:id', requireLogin, async (req, res) => {
  const post = await db.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.author_id !== req.user.id) {
    return res.status(403).json({ error: 'That is not your post.' });
  }
  const { title, subtitle, body, status } = req.body || {};
  const updated = await db.updatePost(post.id, {
    title,
    subtitle,
    body,
    status: status === 'published' || status === 'draft' ? status : undefined,
  });
  res.json(publicPost(updated));
});

// Delete my post.
app.delete('/api/posts/:id', requireLogin, async (req, res) => {
  const post = await db.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.author_id !== req.user.id) {
    return res.status(403).json({ error: 'That is not your post.' });
  }
  await db.deletePost(post.id);
  res.json({ ok: true });
});

// Clap for a post. One clap per user — the database enforces it.
app.post('/api/posts/:id/clap', requireLogin, async (req, res) => {
  const post = await db.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const result = await db.clapPost(post.id, req.user.id);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Profile route
// ---------------------------------------------------------------------------

app.get('/api/users/:username', async (req, res) => {
  const user = await db.getUserByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'No such author.' });
  const posts = (await db.listUserPosts(user.id)).filter((p) => p.status === 'published');
  res.json({
    user: { id: user.id, name: user.name, username: user.username, createdAt: user.created_at },
    posts: posts.map(publicPost),
  });
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

// Create the tables (and seed the welcome post) before accepting requests.
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  Localhost is running!`);
      console.log(`  Open http://localhost:${PORT} in your browser.`);
      console.log(`  Database: Postgres (${process.env.DATABASE_URL || 'postgres://localhost:5432/medium_clone'})`);
      console.log(`  Stop it any time with Ctrl+C.\n`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to Postgres. Is it running?');
    console.error('Start it, create the database (createdb medium_clone), then try again.');
    console.error(err.message);
    process.exit(1);
  });
