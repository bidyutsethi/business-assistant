const express = require("express");
const pool = require("../db");
const { requireAuth, requireEditor } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireEditor);

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, description, trigger_label, action_label, enabled, created_at
     FROM workflows ORDER BY id ASC`
  );
  res.json({ workflows: result.rows });
});

router.put("/:id/toggle", async (req, res) => {
  const result = await pool.query(
    `UPDATE workflows SET enabled = NOT enabled WHERE id = $1
     RETURNING id, name, description, trigger_label, action_label, enabled, created_at`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Workflow not found." });
  res.json({ workflow: result.rows[0] });
});

module.exports = router;
