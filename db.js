// db.js — the "database".
//
// There is no database server here. The whole database is ONE file:
//   data/db.json
// Open it while the server is running and you can literally see your users
// and posts as plain text. That is the point: nothing is hidden.
//
// Trade-off (worth knowing): every request loads the whole file and every
// write saves the whole file. That is fine for a learning project with a
// handful of users, and it is exactly why real apps use SQLite/Postgres
// instead. See LESSONS.md ("Why a real app uses a real database").

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function emptyDb() {
  return { users: [], posts: [], sessions: [], nextUserId: 1, nextPostId: 1 };
}

function seed(db) {
  // One welcome post so the feed is not empty on first run.
  // authorId 0 means "no real user" — it is written by the server itself.
  db.posts.push({
    id: db.nextPostId++,
    authorId: 0,
    authorName: 'Your Local Server',
    title: 'Welcome to your own Medium',
    subtitle: 'This post lives in a file on your laptop. Open data/db.json and you can see it.',
    body: [
      '# Hello, and welcome',
      '',
      'You are reading a post that was **never on the internet**. It lives in',
      '`data/db.json` on your own laptop, and this server — also on your laptop —',
      'turned it into the page you are looking at.',
      '',
      '## Try this',
      '',
      '1. Sign up for an account (top right).',
      '2. Click **Write** and publish your first post.',
      '3. Open `data/db.json` in your editor and find your post in there.',
      '4. Edit the file while the server is running, refresh the page, and watch it change.',
      '',
      'That loop — request in, data out, page rendered — is all a web app is.',
      'Everything else is decoration.',
      '',
      '## What to learn next',
      '',
      'Read `README.md` for the guided tour, then `LESSONS.md` when you want',
      'the deeper explanations: how HTTP works, what a session cookie is,',
      'how to add Google sign-in, and how to put this on the internet.',
    ].join('\n'),
    status: 'published',
    claps: 0,
    clappedBy: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// Load the database from disk. If the file does not exist yet (first run),
// create it with the seed data above.
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    const db = emptyDb();
    seed(db);
    save(db);
    return db;
  }
}

// Save the whole database back to disk.
function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { load, save };
