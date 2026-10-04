const express = require("express");
const pool = require("../db");
const { seedDatabase } = require("../seedData");

const router = express.Router();

// Lets sample data be (re)seeded without Shell access (not available on
// Render's free plan). Protected by a secret key set via ADMIN_SEED_KEY —
// if that env var isn't configured, the endpoint refuses to run at all.
router.post("/seed", async (req, res) => {
  const configuredKey = process.env.ADMIN_SEED_KEY;
  const providedKey = req.headers["x-seed-key"];

  if (!configuredKey) {
    return res.status(404).json({ error: "Not found." });
  }
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: "Invalid or missing seed key." });
  }

  const summary = await seedDatabase();
  res.json({ status: "seeded", summary });
});

// Recovery hatch for the workspace owner: makes the account with the given
// email an admin. Protected by the same ADMIN_SEED_KEY as the seed endpoint.
router.post("/make-admin", async (req, res) => {
  const configuredKey = process.env.ADMIN_SEED_KEY;
  const providedKey = req.headers["x-seed-key"];

  if (!configuredKey) {
    return res.status(404).json({ error: "Not found." });
  }
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: "Invalid or missing seed key." });
  }

  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required." });

  const result = await pool.query(
    `UPDATE users SET access_level = 'admin' WHERE email = $1 RETURNING id, email, access_level`,
    [email]
  );
  if (!result.rows.length) return res.status(404).json({ error: "No account with that email." });
  res.json({ status: "updated", user: result.rows[0] });
});

module.exports = router;
