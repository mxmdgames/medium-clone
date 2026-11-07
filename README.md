# Localhost — a tiny Medium that runs on your laptop

A small Medium clone (sign up, write posts in Markdown, feed, claps, profiles)
built to teach you how web servers actually work. No cloud, no accounts with
any company, no build step. The backend is one Node.js server, and the
database is PostgreSQL running on your own laptop.

## What you will learn

- What a server is and what `localhost:3000` means
- How a browser request becomes a page (routes, JSON APIs, rendering)
- How sign-in works (password hashing, sessions, cookies)
- How data is stored — and why real apps use a real database
- How to add Google sign-in, and how to put the site on the internet

`LESSONS.md` holds the deeper explanations. This file is the hands-on tour.

## Quick start

### 0. Install Node.js (once)

Node.js is the JavaScript runtime that runs the server. You need version 18
or newer.

- **Mac:** download the LTS installer from <https://nodejs.org>, run it.
  (Or with Homebrew: `brew install node`.)
- **Windows:** download the LTS installer from <https://nodejs.org>, run it.
  Accept the defaults.

Check it worked:

```bash
node -v   # should print something like v22.x.x
npm -v    # should print something like 10.x.x
```

### 1. Get the code

```bash
git clone https://github.com/mxmdgames/medium-clone.git
cd medium-clone
```

### 2. Install Postgres and create the database (once)

Postgres is the database server. Install it, start it, and create an empty
database called `medium_clone`:

- **Mac (Homebrew):** `brew install postgresql@16`, then
  `brew services start postgresql@16`, then `createdb medium_clone`.
- **Windows:** download the installer from <https://www.postgresql.org/download/windows>,
  run it (remember the password you set for the `postgres` user), then open
  "SQL Shell (psql)" and run `CREATE DATABASE medium_clone;`.
- **Docker (any OS):**
  `docker run --name medium-clone-db -e POSTGRES_DB=medium_clone -p 5432:5432 -d postgres:16`

Check it worked:

```bash
psql -d medium_clone -c "SELECT version();"
```

The app connects with `DATABASE_URL` (see `.env.example`). The default is
`postgres://localhost:5432/medium_clone` — no password — which works when
your Postgres trusts local connections (Homebrew's default). If yours asks
for a password, copy `.env.example` to `.env` and put your credentials in
the URL, e.g. `DATABASE_URL=postgres://postgres:YOURPASSWORD@localhost:5432/medium_clone`.

### 3. Install dependencies

```bash
npm install
```

This downloads the libraries into `node_modules/` (see "What each
dependency does" below). Nothing else is installed on your computer.

### 4. Start the server

```bash
npm start
```

On first start the server creates the tables itself (from `schema.sql`) and
seeds one welcome post. You will see:

```
Localhost is running!
Open http://localhost:3000 in your browser.
```

Open <http://localhost:3000>. That is your site. It only exists while the
server is running — stop it any time with `Ctrl+C` in the terminal.

### If you ran the first (JSON) version

Your old users and posts live in `data/db.json`. Move them over once:

```bash
npm run migrate
```

It keeps ids, password hashes (nobody needs a new password) and claps.
Sessions are not moved — everyone signs in again. Safe to run twice.

## Your first 10 minutes

Do these in order. Each one teaches something.

1. **Look at the feed.** One welcome post is already there. It came from
   the `posts` table — the server asked Postgres for it and turned it into
   a page.
2. **Sign up** (top right). Any name, username and password works. You just
   created a row in the `users` table and a session row in `sessions`.
3. **Click Write** and publish a post. Use some Markdown: `**bold**`,
   `# a heading`, `[a link](https://example.com)`.
4. **Look at the database.** Run
   `psql -d medium_clone -c "SELECT id, title FROM posts;"` and find your
   post as a row. Change the title with
   `psql -d medium_clone -c "UPDATE posts SET title = 'New title' WHERE id = 2;"`,
   refresh the page, and watch it change.
5. **Clap** on the welcome post, then run
   `psql -d medium_clone -c "SELECT * FROM claps;"` — your user id is now
   in there, and the count on the page is `COUNT(*)` of that table.
6. **Stop the server** (`Ctrl+C`), start it again (`npm start`). Everything
   is still there, because the data lives in Postgres, not in memory.
7. **Open your browser's developer tools** (F12 or Cmd+Option+I), go to the
   Network tab, refresh the page. Watch the browser ask for `/api/posts`
   and get JSON back. That request is the whole frontend/backend contract.

## How it works

```
Browser                          Your laptop
  │                                ┌─────────────────────────┐
  │  GET /api/posts                │  server.js (Express)    │
  │ ─────────────────────────────► │  finds the route, asks  │
  │                                │  db.js for the posts,   │
  │  [{"title": "...", ...}]       │  sends back JSON        │
  │ ◄───────────────────────────── └───────────┬─────────────┘
  │                                ┌───────────▼─────────────┐
  │  JavaScript in public/app.js   │  PostgreSQL             │
  │  turns the JSON into HTML      │  users, posts, claps,   │
  │  and puts it on the page       │  sessions tables        │
  │                                └─────────────────────────┘
```

- **Frontend** (`public/`): plain HTML, CSS and JavaScript. No framework,
  no build. It calls the API with `fetch()` and renders the result.
- **Backend** (`server.js`): an Express app. It defines routes — "when a
  request arrives at this URL, run this code" — and serves the frontend files.
- **Database** (`db.js` + Postgres): `db.js` is the only file that writes
  SQL. It keeps a pool of connections to Postgres and exposes functions
  like `listPublishedPosts()` and `createUser()`. The tables are defined in
  `schema.sql`.

## File map

| File | What it does |
| --- | --- |
| `server.js` | The whole backend: routes, auth checks, Markdown rendering |
| `db.js` | The only file that talks to Postgres: pool, queries, seed |
| `schema.sql` | The tables: users, posts, claps, sessions |
| `migrate.js` | One-time import from the old JSON database (`npm run migrate`) |
| `.env.example` | Copy to `.env` for your connection string |
| `auth.js` | Password hashing |
| `public/index.html` | The home feed |
| `public/post.html` | One full post + clap button |
| `public/write.html` | The editor (new post or edit) |
| `public/auth.html` | Sign in / sign up forms |
| `public/profile.html` | An author's page + your drafts |
| `public/app.js` | Shared frontend helpers (`api()`, header, post cards) |
| `public/style.css` | The Medium-like look |
| `LESSONS.md` | The deeper explanations |

## What each dependency does

Only five, all pure JavaScript (nothing to compile):

- **express** — the web server framework. Routing, JSON parsing, static files.
- **pg** — the Postgres client. Connection pool + parameterized queries.
- **dotenv** — loads `.env` into `process.env` so secrets stay out of git.
- **bcryptjs** — password hashing. Passwords are never stored as plain text.
- **marked** — turns post Markdown into HTML.

## Next steps (in LESSONS.md)

1. How a request flows through the app, step by step
2. How SQL and the four tables work — and how to explore them with `psql`
3. How sessions and cookies work
4. Adding **Google sign-in** (OAuth, explained from zero)
5. Letting other people see it: Cloudflare Tunnel, then a $5 VPS
6. Security notes: what is safe here and what is not production-ready

## Troubleshooting

- **`node: command not found`** — Node is not installed, or your terminal
  was open before you installed it. Close and reopen the terminal, or
  reinstall from <https://nodejs.org>.
- **`psql: command not found`** — Postgres is not installed, or its `bin`
  folder is not on your PATH. On Mac with Homebrew, `brew install
  postgresql@16` and reopen the terminal.
- **"Could not connect to Postgres. Is it running?"** — Postgres is
  installed but not started. Mac: `brew services start postgresql@16`.
  Windows: start it from the Services app or the installer. Docker:
  `docker start medium-clone-db`.
- **`database "medium_clone" does not exist`** — create it:
  `createdb medium_clone` (or `CREATE DATABASE medium_clone;` in psql).
- **Password authentication failed** — your Postgres wants a password.
  Copy `.env.example` to `.env` and set `DATABASE_URL` with your
  username and password in it.
- **SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string** —
  same cause, different symptom: Postgres is asking for a password, but
  the app didn't send one at all, because your `DATABASE_URL` has no
  password in it. Copy `.env.example` to `.env` and put your Postgres
  password in the URL:
  `DATABASE_URL=postgres://postgres:YOURPASSWORD@localhost:5432/medium_clone`
  (use the password you set when installing Postgres — on Windows that's
  the installer password). Then restart the server. If your password
  contains `@`, `:`, `/`, `#` or `%`, URL-encode it (`@` → `%40`) or the
  URL will parse wrong.
- **`EADDRINUSE` / port 3000 already in use** — another copy of the server
  is running, or something else uses port 3000. Stop the other one, or run
  `PORT=4000 npm start` and open <http://localhost:4000>.
- **Changes to `server.js` do nothing** — Node does not reload code
  automatically. Stop the server (`Ctrl+C`) and start it again.
- **Changes to `public/` files do nothing** — hard-refresh the browser
  (Cmd+Shift+R / Ctrl+Shift+R); the browser cached the old file.
- **Want a fresh start?** — `psql -d medium_clone -f schema.sql` recreates
  the tables, or drop and recreate the database:
  `dropdb medium_clone && createdb medium_clone`, then restart the server.
