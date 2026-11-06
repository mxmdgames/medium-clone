-- schema.sql — the shape of the data.
--
-- Run automatically by db.init() on server start, or by hand:
--   psql -d medium_clone -f schema.sql
--
-- Read it as the answer to "what does this app store?": four tables,
-- each with a job, and the database itself enforcing the rules that
-- used to live in JavaScript (unique usernames, one clap per user).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id          SERIAL PRIMARY KEY,
  -- NULL means "no real user" — the welcome post is written by the server.
  author_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per clap. The PRIMARY KEY (post_id, user_id) is what enforces
-- "one clap per user" — the database itself refuses a second row, so no
-- JavaScript check is needed. The clap count is COUNT(*) of these rows.
CREATE TABLE IF NOT EXISTS claps (
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes: the two lookups the app does most (the feed, and one author's posts).
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
