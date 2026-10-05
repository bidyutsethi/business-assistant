const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { newInviteCode } = require("../workspaces");
const { seedDatabase } = require("../seedData");

const router = express.Router();
router.use(requireAuth);

const ACCESS_LEVELS = ["admin", "member", "viewer"];

async function adminCount(workspaceId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE workspace_id = $1 AND access_level = 'admin'`,
    [workspaceId]
  );
  return result.rows[0].count;
}

// Everyone in the caller's workspace. The invite code is only handed to
// admins, since anyone holding it can join.
router.get("/", async (req, res) => {
  const [members, workspace] = await Promise.all([
    pool.query(
      `SELECT id, full_name, company, email, role, access_level, created_at
       FROM users WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [req.workspaceId]
    ),
    pool.query(`SELECT name, invite_code FROM workspaces WHERE id = $1`, [req.workspaceId]),
  ]);
  const { name, invite_code: inviteCode } = workspace.rows[0];
  res.json({
    members: members.rows,
    me: { id: req.userId, accessLevel: req.accessLevel },
    workspace: req.accessLevel === "admin" ? { name, inviteCode } : { name },
  });
});

// Replaces the invite code, so links shared earlier stop working.
router.post("/invite/regenerate", requireAdmin, async (req, res) => {
  const result = await pool.query(`UPDATE workspaces SET invite_code = $1 WHERE id = $2 RETURNING invite_code`, [
    newInviteCode(),
    req.workspaceId,
  ]);
  res.json({ inviteCode: result.rows[0].invite_code });
});

// Fills a brand-new workspace with sample data to explore. Refuses once the
// workspace has any customers, because seeding replaces what's there.
router.post("/sample-data", requireAdmin, async (req, res) => {
  const existing = await pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE workspace_id = $1`, [
    req.workspaceId,
  ]);
  if (existing.rows[0].count > 0) {
    return res.status(409).json({ error: "This workspace already has data, so sample data can't be loaded." });
  }
  const summary = await seedDatabase(req.workspaceId);
  res.json({ status: "loaded", summary });
});

router.put("/:id/access", requireAdmin, async (req, res) => {
  const { accessLevel } = req.body || {};
  if (!ACCESS_LEVELS.includes(accessLevel)) {
    return res.status(400).json({ error: `Access must be one of: ${ACCESS_LEVELS.join(", ")}.` });
  }

  const target = await pool.query(`SELECT id, access_level FROM users WHERE id = $1 AND workspace_id = $2`, [
    req.params.id,
    req.workspaceId,
  ]);
  if (!target.rows.length) return res.status(404).json({ error: "Team member not found." });

  if (
    target.rows[0].access_level === "admin" &&
    accessLevel !== "admin" &&
    (await adminCount(req.workspaceId)) <= 1
  ) {
    return res.status(409).json({ error: "The workspace needs at least one admin." });
  }

  const result = await pool.query(
    `UPDATE users SET access_level = $1 WHERE id = $2 AND workspace_id = $3
     RETURNING id, full_name, company, email, role, access_level, created_at`,
    [accessLevel, req.params.id, req.workspaceId]
  );
  res.json({ member: result.rows[0] });
});

// There's no email service to send a reset link, so an admin resets the
// password instead: this returns a one-time temporary password for the admin
// to pass on. It's only ever shown in this response — only the hash is stored.
router.post("/:id/reset-password", requireAdmin, async (req, res) => {
  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 AND workspace_id = $3 RETURNING id`,
    [passwordHash, req.params.id, req.workspaceId]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Team member not found." });
  res.json({ temporaryPassword });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.userId) {
    return res.status(409).json({ error: "You can't remove your own account." });
  }
  const result = await pool.query(`DELETE FROM users WHERE id = $1 AND workspace_id = $2 RETURNING id`, [
    req.params.id,
    req.workspaceId,
  ]);
  if (!result.rows.length) return res.status(404).json({ error: "Team member not found." });
  res.json({ status: "removed" });
});

module.exports = router;
