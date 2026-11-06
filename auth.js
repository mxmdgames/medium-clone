// auth.js — passwords only.
//
// One job lives here: passwords. Never store a password as plain text.
// bcrypt turns it into a one-way hash. To check a login, hash what the
// user typed and compare.
//
// Sessions (the "you are logged in" cookie) live in db.js now — they are
// rows in the sessions table, created and looked up with SQL.

const bcrypt = require('bcryptjs');

// Turn a plain-text password into a hash. The 10 is the cost factor —
// higher is slower to crack and slower to compute. 10 is the standard.
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// Check a login attempt against a stored hash.
function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { hashPassword, checkPassword };
