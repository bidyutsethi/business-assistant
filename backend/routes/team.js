const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, requireAdmin, getAccessLevel } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const ACCESS_LEVELS = ["admin", "member", "viewer"];

async function adminCount() {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE access_level = 'admin'`);
  return result.rows[0].count;
}

// No multi-tenancy yet — every signed-up account is a "teammate" in one
// shared workspace, so this simply lists all registered users.
router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, full_name, company, email, role, access_level, created_at FROM users ORDER BY created_at ASC`
  );
  res.json({
    members: result.rows,
    me: { id: Number(req.userId), accessLevel: await getAccessLevel(req.userId) },
  });
});

router.put("/:id/access", requireAdmin, async (req, res) => {
  const { accessLevel } = req.body || {};
  if (!ACCESS_LEVELS.includes(accessLevel)) {
    return res.status(400).json({ error: `Access must be one of: ${ACCESS_LEVELS.join(", ")}.` });
  }

  const target = await pool.query(`SELECT id, access_level FROM users WHERE id = $1`, [req.params.id]);
  if (!target.rows.length) return res.status(404).json({ error: "Team member not found." });

  if (target.rows[0].access_level === "admin" && accessLevel !== "admin" && (await adminCount()) <= 1) {
    return res.status(409).json({ error: "The workspace needs at least one admin." });
  }

  const result = await pool.query(
    `UPDATE users SET access_level = $1 WHERE id = $2
     RETURNING id, full_name, company, email, role, access_level, created_at`,
    [accessLevel, req.params.id]
  );
  res.json({ member: result.rows[0] });
});

// There's no email service to send a reset link, so an admin resets the
// password instead: this returns a one-time temporary password for the admin
// to pass on. It's only ever shown in this response — only the hash is stored.
router.post("/:id/reset-password", requireAdmin, async (req, res) => {
  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const result = await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id`, [
    passwordHash,
    req.params.id,
  ]);
  if (!result.rows.length) return res.status(404).json({ error: "Team member not found." });
  res.json({ temporaryPassword });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (Number(req.params.id) === Number(req.userId)) {
    return res.status(409).json({ error: "You can't remove your own account." });
  }
  const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Team member not found." });
  res.json({ status: "removed" });
});

module.exports = router;
