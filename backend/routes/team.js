const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// No multi-tenancy yet — every signed-up account is a "teammate" in one
// shared workspace, so this simply lists all registered users.
router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, full_name, company, email, role, created_at FROM users ORDER BY created_at ASC`
  );
  res.json({ members: result.rows });
});

module.exports = router;
