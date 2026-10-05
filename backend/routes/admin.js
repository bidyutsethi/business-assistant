const express = require("express");
const pool = require("../db");
const { seedDatabase } = require("../seedData");

const router = express.Router();

// These endpoints are for the site owner, not signed-in users: they're
// protected by a secret key set via ADMIN_SEED_KEY (sent as X-Seed-Key).
// If that env var isn't configured they refuse to run at all.
router.use((req, res, next) => {
  const configuredKey = process.env.ADMIN_SEED_KEY;
  const providedKey = req.headers["x-seed-key"];

  if (!configuredKey) {
    return res.status(404).json({ error: "Not found." });
  }
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: "Invalid or missing seed key." });
  }
  next();
});

function bodyEmail(req) {
  return String((req.body || {}).email || "").trim().toLowerCase();
}

// Lets sample data be (re)seeded without Shell access (not available on
// Render's free plan). Seeds the workspace of the account with the given
// email, or the oldest workspace when no email is sent. Only that one
// workspace's customers, orders, tickets and tasks are replaced.
router.post("/seed", async (req, res) => {
  const email = bodyEmail(req);
  const result = email
    ? await pool.query(`SELECT workspace_id AS id FROM users WHERE email = $1`, [email])
    : await pool.query(`SELECT id FROM workspaces ORDER BY id ASC LIMIT 1`);
  if (!result.rows.length) {
    return res.status(404).json({ error: email ? "No account with that email." : "No workspace exists yet — sign up first." });
  }

  const summary = await seedDatabase(result.rows[0].id);
  res.json({ status: "seeded", summary });
});

// Recovery hatch: makes the account with the given email an admin of its
// own workspace.
router.post("/make-admin", async (req, res) => {
  const email = bodyEmail(req);
  if (!email) return res.status(400).json({ error: "Email is required." });

  const result = await pool.query(
    `UPDATE users SET access_level = 'admin' WHERE email = $1 RETURNING id, email, access_level`,
    [email]
  );
  if (!result.rows.length) return res.status(404).json({ error: "No account with that email." });
  res.json({ status: "updated", user: result.rows[0] });
});

module.exports = router;
