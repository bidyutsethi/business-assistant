const express = require("express");
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

module.exports = router;
