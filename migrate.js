// migrate.js — one-time import from the old JSON database into Postgres.
//
// If you ran the first version of this project, your users and posts live
// in data/db.json. This script moves them into Postgres, keeping ids,
// password hashes (they transfer as-is — nobody needs a new password),
// and claps.
//
// Usage:
//   npm run migrate
//
// Safe to run when there is no data/db.json — it just exits.
// Safe to run twice — ON CONFLICT skips rows that are already there.
// Sessions are NOT migrated (they expire in 7 days anyway) — everyone
// signs in again after the move.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function main() {
  const jsonPath = path.join(__dirname, 'data', 'db.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('No data/db.json found — nothing to migrate.');
    return;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  await db.init();

  // Users first — posts reference them.
  for (const u of data.users || []) {
    await db.query(
      `INSERT INTO users (id, name, username, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      [u.id, u.name, u.username, u.passwordHash, u.createdAt]
    );
  }
  // Move the id counter past the imported rows, so the next new user
  // does not collide with an imported id.
  await db.query(
    `SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))`
  );

  for (const p of data.posts || []) {
    await db.query(
      `INSERT INTO posts (id, author_id, author_name, title, subtitle, body, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id,
        p.authorId === 0 ? null : p.authorId,
        p.authorName,
        p.title,
        p.subtitle,
        p.body,
        p.status,
        p.createdAt,
        p.updatedAt,
      ]
    );
    for (const userId of p.clappedBy || []) {
      await db.query(
        'INSERT INTO claps (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [p.id, userId]
      );
    }
  }
  await db.query(
    `SELECT setval(pg_get_serial_sequence('posts', 'id'), COALESCE((SELECT MAX(id) FROM posts), 1))`
  );

  console.log(
    `Migrated ${data.users.length} users and ${data.posts.length} posts into Postgres.`
  );
  console.log('Sessions were not migrated — everyone signs in again.');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
