# Localhost — a tiny Medium that runs on your laptop

A small Medium clone (sign up, write posts in Markdown, feed, claps, profiles)
built to teach you how web servers actually work. No cloud, no accounts with
any company, no build step. The whole backend is one Node.js server, and the
whole database is one JSON file you can open and read.

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

### 2. Install dependencies

```bash
npm install
```

This downloads three small libraries into `node_modules/` (see "What each
dependency does" below). Nothing else is installed on your computer.

### 3. Start the server

```bash
npm start
```

You will see:

```
Localhost is running!
Open http://localhost:3000 in your browser.
```

Open <http://localhost:3000>. That is your site. It only exists while the
server is running — stop it any time with `Ctrl+C` in the terminal.

## Your first 10 minutes

Do these in order. Each one teaches something.

1. **Look at the feed.** One welcome post is already there. It came from
   `data/db.json` — the server read the file and turned it into a page.
2. **Sign up** (top right). Any name, username and password works. You just
   created a row in the database and a session cookie in your browser.
3. **Click Write** and publish a post. Use some Markdown: `**bold**`,
   `# a heading`, `[a link](https://example.com)`.
4. **Open `data/db.json`** in your editor. Find your post in there. Change
   the title, save, refresh the page. You just edited the database by hand
   and watched the site change.
5. **Clap** on the welcome post, then look at `data/db.json` again — your
   user id is now in its `clappedBy` list.
6. **Stop the server** (`Ctrl+C`), start it again (`npm start`). Everything
   is still there, because the data lives in a file, not in memory.
7. **Open your browser's developer tools** (F12 or Cmd+Option+I), go to the
   Network tab, refresh the page. Watch the browser ask for `/api/posts`
   and get JSON back. That request is the whole frontend/backend contract.

## How it works

```
Browser                          Your laptop
  │                                ┌─────────────────────────┐
  │  GET /api/posts                │  server.js (Express)    │
  │ ─────────────────────────────► │  finds the route,       │
  │                                │  loads db.json,         │
  │  [{"title": "...", ...}]       │  sends back JSON        │
  │ ◄───────────────────────────── └─────────────────────────┘
  │                                ┌─────────────────────────┐
  │  JavaScript in public/app.js   │  data/db.json           │
  │  turns the JSON into HTML      │  users, posts, sessions │
  │  and puts it on the page       └─────────────────────────┘
```

- **Frontend** (`public/`): plain HTML, CSS and JavaScript. No framework,
  no build. It calls the API with `fetch()` and renders the result.
- **Backend** (`server.js`): an Express app. It defines routes — "when a
  request arrives at this URL, run this code" — and serves the frontend files.
- **Database** (`data/db.json`): one JSON file with `users`, `posts` and
  `sessions`. Created automatically on first run.

## File map

| File | What it does |
| --- | --- |
| `server.js` | The whole backend: routes, auth checks, Markdown rendering |
| `db.js` | Loads and saves `data/db.json` |
| `auth.js` | Password hashing and session creation |
| `public/index.html` | The home feed |
| `public/post.html` | One full post + clap button |
| `public/write.html` | The editor (new post or edit) |
| `public/auth.html` | Sign in / sign up forms |
| `public/profile.html` | An author's page + your drafts |
| `public/app.js` | Shared frontend helpers (`api()`, header, post cards) |
| `public/style.css` | The Medium-like look |
| `LESSONS.md` | The deeper explanations |

## What each dependency does

Only three, all pure JavaScript (nothing to compile):

- **express** — the web server framework. Routing, JSON parsing, static files.
- **bcryptjs** — password hashing. Passwords are never stored as plain text.
- **marked** — turns post Markdown into HTML.

## Next steps (in LESSONS.md)

1. How a request flows through the app, step by step
2. Why a real app uses a real database (and how to switch to SQLite)
3. How sessions and cookies work
4. Adding **Google sign-in** (OAuth, explained from zero)
5. Letting other people see it: Cloudflare Tunnel, then a $5 VPS
6. Security notes: what is safe here and what is not production-ready

## Troubleshooting

- **`node: command not found`** — Node is not installed, or your terminal
  was open before you installed it. Close and reopen the terminal, or
  reinstall from <https://nodejs.org>.
- **`EADDRINUSE` / port 3000 already in use** — another copy of the server
  is running, or something else uses port 3000. Stop the other one, or run
  `PORT=4000 npm start` and open <http://localhost:4000>.
- **Changes to `server.js` do nothing** — Node does not reload code
  automatically. Stop the server (`Ctrl+C`) and start it again.
- **Changes to `public/` files do nothing** — hard-refresh the browser
  (Cmd+Shift+R / Ctrl+Shift+R); the browser cached the old file.
- **`data/db.json` got mangled** — delete the `data/` folder and restart.
  The server recreates it with the welcome post.
