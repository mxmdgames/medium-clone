// auth.js — passwords and sessions.
//
// Two jobs live here:
//   1. Passwords: never store a password as plain text. bcrypt turns it into
//      a one-way hash. To check a login, hash what the user typed and compare.
//   2. Sessions: after a login, the server creates a random session id, stores
//      it in the database, and hands it to the browser as a cookie. On every
//      later request the browser sends the cookie back, and the server looks
//      the session up to find out who is asking.
//
// That cookie is the whole "you are logged in" mechanism. There is no magic.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SESSION_DAYS = 7;

// Turn a plain-text password into a hash. The 10 is the cost factor —
// higher is slower to crack and slower to compute. 10 is the standard.
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// Check a login attempt against a stored hash.
function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Create a session for a user and store it in the database.
// The caller is responsible for saving the database afterwards.
function createSession(data, userId) {
  const session = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  data.sessions.push(session);
  return session;
}

module.exports = { hashPassword, checkPassword, createSession };
