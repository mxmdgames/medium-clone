# Lessons — how this all actually works

Read these after the hands-on tour in `README.md`. Each lesson is short and
stands alone.

---

## 1. What is a server, really?

A server is just a program that waits for messages and answers them.

- Your browser sends a **request**: "GET /api/posts" — "give me the list of
  posts."
- The server runs some code and sends back a **response**: usually JSON data
  or an HTML page.
- That is the entire job. Everything else — frameworks, databases, clouds —
  is help doing that job better.

**localhost** means "this computer." `http://localhost:3000` is a website
whose server is your own laptop. Nothing leaves your machine: the request
goes from your browser to a program on the same computer and back.

**3000 is the port** — think of it as an apartment number. One computer can
run many servers at once, each on its own port: your site on 3000, another
app on 4000, and so on. Ports below 1024 are reserved for system services,
which is why tutorials use 3000, 4000, 8000, 8080.

---

## 2. How a request flows through this app

Trace one feed load, end to end:

1. You open `http://localhost:3000`.
2. Express sees the request for `/` and the `express.static` middleware
   serves `public/index.html`.
3. The browser reads the HTML, which loads `style.css` and `app.js`.
4. The inline script in `index.html` calls `api('/api/posts')` — a `fetch()`
   to `GET /api/posts`.
5. Express matches the `app.get('/api/posts', ...)` route in `server.js`.
6. The route calls `db.listPublishedPosts()`, which runs one SQL query
   against Postgres (see lesson 4) and gets the rows back.
7. `server.js` renders each post's Markdown to HTML with `marked`.
8. Express sends the array back as JSON.
9. `app.js` turns each post into HTML (`postCard()`) and puts it on the page.

Two things worth noticing:

- **The frontend and backend only talk through the API.** The page never
  touches the database directly. If you replaced Postgres with something
  else tomorrow, the frontend would not change at all.
- **The server asks the database only for what it needs.** The SQL says
  "published posts, newest first" and Postgres does the filtering and
  sorting — the old JSON version loaded everything and filtered in
  JavaScript.

Try it yourself: open DevTools (F12), Network tab, refresh, and click the
`/api/posts` request to see the raw JSON.

---

## 3. Routes and HTTP methods

A route is a pair: a **method** + a **URL pattern**.

| Method | Meaning | Example in this app |
| --- | --- | --- |
| GET | Read something | `GET /api/posts` — list the feed |
| POST | Create something | `POST /api/posts` — publish a post |
| PUT | Replace/update something | `PUT /api/posts/3` — edit post 3 |
| DELETE | Remove something | `DELETE /api/posts/3` — delete post 3 |

The pattern is a convention, not a law, but every API you will ever use
follows it: the URL names the *thing*, the method says what to *do* with it.

`requireLogin` is **middleware** — a function that runs before the route. If
there is no valid session it answers 401 and the route never runs. That is
how "only signed-in users can post" is enforced: not in the frontend (anyone
can bypass that), but on the server.

---

## 4. The database: PostgreSQL

The first version of this project stored everything in one JSON file.
It worked, and it was easy to see — but it had real limits: every read
loaded the whole file, every write rewrote it, two writes at the same
moment could overwrite each other, and there was no way to ask "posts by
this author, newest first" without loading everything and filtering in
JavaScript.

Postgres fixes all of that, and it is still just a program on your laptop.
It stores **tables** — grids of rows and columns — and you ask it questions
in **SQL**.

### The four tables (see `schema.sql`)

| Table | What it stores |
| --- | --- |
| `users` | id, name, username (unique), password hash |
| `posts` | id, author, title, subtitle, body, status (draft/published) |
| `claps` | one row per clap: post + user. The primary key on both columns is what enforces "one clap per user" — the database refuses a second row. |
| `sessions` | id, user, expiry — the "you are logged in" records |

### Try it yourself

```sql
-- see all posts
SELECT id, title, status FROM posts;

-- the feed query, the way the app asks it
SELECT id, title FROM posts WHERE status = 'published' ORDER BY created_at DESC;

-- how many claps does post 1 have? (the app asks this on every feed load)
SELECT COUNT(*) FROM claps WHERE post_id = 1;

-- who wrote the most posts?
SELECT author_name, COUNT(*) FROM posts GROUP BY author_name;
```

Run them with `psql -d medium_clone -c "SELECT ..."`.

### How the app talks to Postgres

- `db.js` keeps a **pool** of connections open (via the `pg` library), so
  requests do not pay the cost of connecting every time.
- Every query uses **parameters** (`$1`, `$2`) instead of pasting values
  into the SQL string. That is what stops SQL injection: a post title
  containing `'; DROP TABLE posts; --` is treated as data, never as code.
- `db.init()` runs `schema.sql` on startup, so the tables always exist
  before the first request.
- Only `db.js` writes SQL. `server.js` calls functions like
  `listPublishedPosts()` and never sees a query string. That separation is
  what made this migration a rewrite of one file instead of the whole app.

### The migration

`migrate.js` moved the old JSON data into Postgres (`npm run migrate`).
It is worth reading: users first (posts reference them), then posts, then
claps, then the id counters moved past the imported rows with `setval`.
Password hashes transferred as-is, so nobody needed a new password.

---

## 5. Auth: hashing, sessions, cookies

Three separate ideas that are often confused:

**Hashing (passwords).** `bcryptjs` turns `hunter2` into a long string that
cannot be turned back. When you log in, the server hashes what you typed
and compares it to the stored hash. If someone steals `db.json`, they get
hashes, not passwords. That is why you never store plain-text passwords —
and why "forgot password" always means "set a new one," never "we'll send
you yours."

**Sessions.** After a successful login, the server creates a random session
id (a UUID), stores it as a row in the `sessions` table next to your user
id, and tells the browser to remember it. The session id is a temporary
key, not your identity — it expires after 7 days (the `expires_at`
column) and can be revoked by deleting the row. Logging out deletes it.

**Cookies.** The browser stores the session id in a cookie and sends it
automatically with every request to the site. The server looks it up
(`getSessionUser` in `server.js`) and knows who is asking. The cookie has
`httpOnly` set, which means JavaScript on the page cannot read it — that
protects the session from being stolen by malicious scripts.

To see it: DevTools → Application → Cookies → `http://localhost:3000`.
Delete the `session_id` cookie and refresh — you are logged out.

---

## 6. What the browser does

The frontend has one job: turn API data into a page.

- `fetch()` sends a request and returns a promise of the response.
- `api()` in `app.js` is a thin wrapper: it adds the JSON header, parses
  the response, and throws a readable error when the server says no.
- `postCard()` builds HTML strings. `escapeHtml()` is used on every piece
  of user text before it goes into the page — otherwise a post titled
  `<script>alert(1)</script>` would run code in every reader's browser.
  That attack is called XSS (cross-site scripting).
- The one exception: `bodyHtml` comes from `marked`, which renders the
  author's Markdown *including any raw HTML they wrote*. On a local
  learning project that is fine. On a public site you would sanitize it
  first (a library like `sanitize-html`) — real Medium does exactly this.

---

## 7. Adding Google sign-in (OAuth, from zero)

Right now accounts are username + password, stored locally. Google sign-in
replaces the password step with Google vouching for the user. The flow:

1. Your site sends the user to Google: "this app wants to know who you are."
2. The user signs in on Google's page (your site never sees their password).
3. Google sends them back to your site with a temporary **code**.
4. Your server exchanges the code with Google for the user's profile
   (name, email, Google id).
5. Your server looks up that Google id in your database — existing user?
   Log them in. New user? Create an account linked to that Google id.

That is OAuth 2.0. The library that does the heavy lifting in Node is
`passport` with the `passport-google-oauth20` strategy, or Google's own
`google-auth-library`.

To add it to this project you need:

1. A Google Cloud project (free) at <https://console.cloud.google.com>,
   with the "Google Identity" OAuth consent screen configured.
2. An OAuth client id + secret, with the redirect URI set to
   `http://localhost:3000/auth/google/callback`.
3. The client id/secret in a `.env` file (never committed to git — add
   `.env` to `.gitignore`).
4. A `googleId` field on users, a `/auth/google` route to start the flow,
   and a callback route to finish it.

Apple sign-in works the same way, but Apple requires a paid Apple Developer
account ($99/year) and a "Service ID" before it will issue credentials.
That is Apple's rule, not a limitation of this code.

---

## 8. Letting other people see it

Your server only listens on your laptop. Three ways to change that:

**Cloudflare Tunnel (free, easiest).** Install `cloudflared`, run
`cloudflared tunnel --url http://localhost:3000`, and you get a public
`https://something.trycloudflare.com` address that forwards to your laptop.
Anyone can read the site; it goes down when your laptop sleeps. Good for
showing a friend.

**Tailscale (free, private).** Install Tailscale on your laptop and your
phone, and the site is reachable only to devices on your private network —
no public exposure at all. Good for testing from your phone.

**A VPS (about $5/month, the real thing).** Rent a tiny always-on server
(DigitalOcean, Hetzner, Linode), copy the project there, run it with a
process manager (`pm2` or `systemd`) so it restarts if it crashes, and
point a domain at it. This is what "deploying" means, and it is the same
code — the server does not care which computer it runs on. The main new
skills are SSH and keeping the server updated.

Do **not** open ports on your home router to expose the server directly.
That is the one option that puts your home network at risk.

---

## 9. What is not production-ready here (and why that is fine)

- **The database is on your laptop.** Anyone with access to your Postgres
  can read everything. On a VPS, Postgres should listen on localhost only
  (the default) and the password should be long and random.
- **Markdown HTML is not sanitized** — see lesson 6.
- **No rate limiting.** Anyone can hammer the signup route. A public site
  adds limits (e.g. `express-rate-limit`).
- **No HTTPS locally.** On `localhost` that does not matter (the traffic
  never leaves your machine). On a VPS or tunnel, HTTPS is mandatory —
  Cloudflare Tunnel and any decent host provide it automatically.
- **Sessions live in the sessions table.** That already survives restarts,
  but if you ever run two servers they would need to share the same
  database — which, with Postgres, they do. (The old JSON version could
  not say that.)
- **Passwords have a minimum length but no strength rules.** Good enough
  for a local project; a public site wants more.

None of these are mistakes — they are deliberate simplifications so the
whole app fits in your head at once. Each one is a lesson waiting for you
when you want it.

---

## 10. Where to go from here

- Add Google sign-in (lesson 7).
- Add comments on posts — it is the same pattern as claps, with a new
  table in the database.
- Add tags and a tag page — same pattern again.
- Deploy it to a VPS (lesson 8) and give it a real domain. On the VPS,
  Postgres runs the same way it does on your laptop — the app just points
  `DATABASE_URL` at it.
- When the single `server.js` gets too big, split routes into files
  (`routes/posts.js`, `routes/auth.js`) — that is the moment Express apps
  usually grow up.
