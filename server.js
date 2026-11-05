// server.js — the whole backend, top to bottom.
//
// How to read this file:
//   1. Setup at the top (imports, app, middleware).
//   2. Helpers in the middle (who is logged in, what a post looks like).
//   3. Routes at the bottom — one block per URL. A "route" is just:
//      "when a request arrives at this URL with this method, run this code."
//
// Run it with:  npm start
// Then open:    http://localhost:3000

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
// The browser sends the cookie automatically on every request.
function getSessionUser(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (!match) return null;

  const data = db.load();
  const session = data.sessions.find((s) => s.id === match[1]);
  if (!session || session.expiresAt < Date.now()) return null;
  return data.users.find((u) => u.id === session.userId) || null;
}

// Middleware: stop the request unless someone is logged in.
function requireLogin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  req.user = user;
  next();
}

function readingTime(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)); // ~200 words per minute
}

// Shape a post for the API: attach the author, render Markdown to HTML,
// and never send password hashes (they live on users, not posts, but the
// rule is worth stating: only ever send what the page actually needs).
function publicPost(data, post) {
  const author = data.users.find((u) => u.id === post.authorId);
  return {
    id: post.id,
    title: post.title,
    subtitle: post.subtitle,
    bodyHtml: marked.parse(post.body),
    body: post.body,
    status: post.status,
    claps: post.claps,
    clappedBy: post.clappedBy,
    author: author
      ? { username: author.username, name: author.name }
      : { username: null, name: post.authorName || 'Unknown' },
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    readingTime: readingTime(post.body),
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

app.post('/api/auth/signup', (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = db.load();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'That username is taken.' });
  }

  const user = {
    id: data.nextUserId++,
    name,
    username,
    passwordHash: auth.hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  const session = auth.createSession(data, user.id);
  db.save(data);

  setSessionCookie(res, session);
  res.status(201).json({ user: { id: user.id, name: user.name, username: user.username } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const data = db.load();
  const user = data.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
  if (!user || !auth.checkPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  const session = auth.createSession(data, user.id);
  db.save(data);
  setSessionCookie(res, session);
  res.json({ user: { id: user.id, name: user.name, username: user.username } });
});

app.post('/api/auth/logout', (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (match) {
    const data = db.load();
    data.sessions = data.sessions.filter((s) => s.id !== match[1]);
    db.save(data);
  }
  res.clearCookie('session_id', { path: '/' });
  res.json({ ok: true });
});

// Who am I right now? The frontend calls this on every page load.
app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, name: user.name, username: user.username } });
});

// ---------------------------------------------------------------------------
// Post routes
// ---------------------------------------------------------------------------

// Home feed: published posts, newest first.
app.get('/api/posts', (req, res) => {
  const data = db.load();
  const posts = data.posts
    .filter((p) => p.status === 'published')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(posts.map((p) => publicPost(data, p)));
});

// My posts: drafts and published, mine only.
app.get('/api/posts/mine', requireLogin, (req, res) => {
  const data = db.load();
  const posts = data.posts
    .filter((p) => p.authorId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(posts.map((p) => publicPost(data, p)));
});

// One post. Drafts are only visible to their author.
app.get('/api/posts/:id', (req, res) => {
  const data = db.load();
  const post = data.posts.find((p) => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.status !== 'published') {
    const user = getSessionUser(req);
    if (!user || user.id !== post.authorId) {
      return res.status(404).json({ error: 'Post not found.' });
    }
  }
  res.json(publicPost(data, post));
});

// Write a post.
app.post('/api/posts', requireLogin, (req, res) => {
  const { title, subtitle, body, status } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }
  const data = db.load();
  const post = {
    id: data.nextPostId++,
    authorId: req.user.id,
    authorName: req.user.name,
    title,
    subtitle: subtitle || '',
    body,
    status: status === 'published' ? 'published' : 'draft',
    claps: 0,
    clappedBy: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.posts.push(post);
  db.save(data);
  res.status(201).json(publicPost(data, post));
});

// Edit my post.
app.put('/api/posts/:id', requireLogin, (req, res) => {
  const data = db.load();
  const post = data.posts.find((p) => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.authorId !== req.user.id) {
    return res.status(403).json({ error: 'That is not your post.' });
  }
  const { title, subtitle, body, status } = req.body || {};
  if (title !== undefined) post.title = title;
  if (subtitle !== undefined) post.subtitle = subtitle;
  if (body !== undefined) post.body = body;
  if (status === 'published' || status === 'draft') post.status = status;
  post.updatedAt = new Date().toISOString();
  db.save(data);
  res.json(publicPost(data, post));
});

// Delete my post.
app.delete('/api/posts/:id', requireLogin, (req, res) => {
  const data = db.load();
  const index = data.posts.findIndex((p) => p.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Post not found.' });
  if (data.posts[index].authorId !== req.user.id) {
    return res.status(403).json({ error: 'That is not your post.' });
  }
  data.posts.splice(index, 1);
  db.save(data);
  res.json({ ok: true });
});

// Clap for a post. One clap per user — clicking again does nothing new.
app.post('/api/posts/:id/clap', requireLogin, (req, res) => {
  const data = db.load();
  const post = data.posts.find((p) => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (!post.clappedBy.includes(req.user.id)) {
    post.clappedBy.push(req.user.id);
    post.claps = post.clappedBy.length;
    db.save(data);
    return res.json({ claps: post.claps, clapped: true });
  }
  res.json({ claps: post.claps, clapped: false });
});

// ---------------------------------------------------------------------------
// Profile route
// ---------------------------------------------------------------------------

app.get('/api/users/:username', (req, res) => {
  const data = db.load();
  const user = data.users.find(
    (u) => u.username.toLowerCase() === req.params.username.toLowerCase()
  );
  if (!user) return res.status(404).json({ error: 'No such author.' });
  const posts = data.posts
    .filter((p) => p.authorId === user.id && p.status === 'published')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    user: { id: user.id, name: user.name, username: user.username, createdAt: user.createdAt },
    posts: posts.map((p) => publicPost(data, p)),
  });
});

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  Localhost is running!`);
  console.log(`  Open http://localhost:${PORT} in your browser.`);
  console.log(`  Stop it any time with Ctrl+C.\n`);
});
