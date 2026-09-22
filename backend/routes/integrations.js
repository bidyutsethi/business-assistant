const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, category, connected, created_at FROM integrations ORDER BY category, id`
  );
  res.json({ integrations: result.rows });
});

// Toggling here flips a status flag in our own database — it does not
// perform a real OAuth connection to the third-party service. A genuine
// connection would need that service's API credentials configured by an
// admin (see backend/.env.example for the pattern used elsewhere).
router.put("/:id/toggle", async (req, res) => {
  const result = await pool.query(
    `UPDATE integrations SET connected = NOT connected WHERE id = $1
     RETURNING id, name, category, connected, created_at`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Integration not found." });
  res.json({ integration: result.rows[0] });
});

module.exports = router;
