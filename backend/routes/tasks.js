const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const STATUSES = ["open", "approval", "scheduled", "done"];

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, status, created_at FROM tasks ORDER BY created_at DESC`
  );
  res.json({ tasks: result.rows });
});

router.post("/", async (req, res) => {
  const { title, status } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Task title is required." });
  const taskStatus = STATUSES.includes(status) ? status : "open";
  const result = await pool.query(
    `INSERT INTO tasks (title, status) VALUES ($1, $2) RETURNING id, title, status, created_at`,
    [title.trim(), taskStatus]
  );
  res.status(201).json({ task: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const { title, status } = req.body || {};
  const updates = [];
  const params = [];

  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ error: "Task title cannot be empty." });
    params.push(title.trim());
    updates.push(`title = $${params.length}`);
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
    }
    params.push(status);
    updates.push(`status = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  params.push(req.params.id);
  const result = await pool.query(
    `UPDATE tasks SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, title, status, created_at`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: "Task not found." });
  res.json({ task: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const result = await pool.query(`DELETE FROM tasks WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Task not found." });
  res.json({ status: "deleted" });
});

module.exports = router;
