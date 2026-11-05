// app.js — shared helpers every page uses.
//
// The frontend is deliberately plain JavaScript: no framework, no build.
// Each page calls the /api/* routes from server.js with fetch() and
// renders the result into the HTML. That is the whole frontend pattern.

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// The logged-in user, fetched once and cached.
let _me = null;
let _meLoaded = false;
async function getMe() {
  if (!_meLoaded) {
    const r = await api('/api/auth/me');
    _me = r.user;
    _meLoaded = true;
  }
  return _me;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// One feed card, as HTML. Used by the home page and profile pages.
function postCard(p) {
  const author = p.author.username
    ? `<a class="author" href="/profile.html?u=${encodeURIComponent(p.author.username)}">${escapeHtml(p.author.name)}</a>`
    : `<span class="author">${escapeHtml(p.author.name)}</span>`;
  const draftTag = p.status === 'draft' ? '<span class="tag-draft">Draft</span>' : '';
  return `
    <article class="post-card">
      <div class="meta">${author} &middot; ${formatDate(p.createdAt)}</div>
      <h2><a href="/post.html?id=${p.id}">${escapeHtml(p.title)}</a></h2>
      ${p.subtitle ? `<p class="subtitle">${escapeHtml(p.subtitle)}</p>` : ''}
      <div class="foot">
        <span>${p.readingTime} min read</span>
        <span>&#128079; ${p.claps}</span>
        ${draftTag}
      </div>
    </article>`;
}

// Fill the header's auth area: "Write / Sign in / Get started" when logged
// out, or "Write / Your name / Sign out" when logged in.
async function renderHeader() {
  const area = document.getElementById('auth-area');
  if (!area) return;
  const user = await getMe();
  if (user) {
    area.innerHTML =
      `<a href="/write.html">Write</a>` +
      `<a href="/profile.html?u=${encodeURIComponent(user.username)}">${escapeHtml(user.name)}</a>` +
      `<button id="logout-btn" type="button">Sign out</button>`;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/';
    });
  } else {
    area.innerHTML =
      `<a href="/write.html">Write</a>` +
      `<a href="/auth.html">Sign in</a>` +
      `<a class="btn" href="/auth.html?mode=signup">Get started</a>`;
  }
}

document.addEventListener('DOMContentLoaded', renderHeader);
