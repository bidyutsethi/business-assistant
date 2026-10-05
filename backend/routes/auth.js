const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth, isSiteOwner } = require("../middleware/auth");
const { createWorkspace } = require("../workspaces");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    company: user.company,
    email: user.email,
    role: user.role,
    accessLevel: user.access_level,
    workspaceName: user.workspace_name,
    isSiteOwner: user.is_site_owner,
  };
}

async function loadUser(id) {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.company, u.email, u.role, u.access_level, u.workspace_id, w.name AS workspace_name
     FROM users u JOIN workspaces w ON w.id = u.workspace_id
     WHERE u.id = $1`,
    [id]
  );
  const user = result.rows[0];
  user.is_site_owner = await isSiteOwner(user.workspace_id, user.access_level);
  return user;
}

// Lets the signup page show which workspace an invite link leads to.
router.get("/invite/:code", async (req, res) => {
  const result = await pool.query(`SELECT name FROM workspaces WHERE invite_code = $1`, [req.params.code]);
  if (!result.rows.length) return res.status(404).json({ error: "This invite link is no longer valid." });
  res.json({ workspaceName: result.rows[0].name });
});

router.post("/signup", async (req, res) => {
  const { fullName, company, email, password, inviteCode } = req.body || {};

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "Full name, email and password are required." });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  // With an invite code the account joins that workspace as a member.
  // Without one it gets a new, private workspace and is its admin.
  let workspaceId;
  let accessLevel;
  if (inviteCode) {
    const invited = await pool.query(`SELECT id FROM workspaces WHERE invite_code = $1`, [String(inviteCode)]);
    if (!invited.rows.length) {
      return res.status(400).json({ error: "This invite link is no longer valid. Ask your admin for a new one." });
    }
    workspaceId = invited.rows[0].id;
    accessLevel = "member";
  } else {
    const name = (company && String(company).trim()) || `${String(fullName).trim().split(" ")[0]}'s workspace`;
    workspaceId = (await createWorkspace(name)).id;
    accessLevel = "admin";
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, company, email, password_hash, access_level, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [fullName, company || null, normalizedEmail, passwordHash, accessLevel, workspaceId]
  );

  const user = await loadUser(result.rows[0].id);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [normalizedEmail]);
  const account = result.rows[0];

  if (!account) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const user = await loadUser(account.id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(await loadUser(req.userId)) });
});

router.put("/me", requireAuth, async (req, res) => {
  const { fullName, company } = req.body || {};
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: "Full name is required." });
  }
  await pool.query(`UPDATE users SET full_name = $1, company = $2 WHERE id = $3`, [
    fullName.trim(),
    company ? company.trim() : null,
    req.userId,
  ]);
  res.json({ user: publicUser(await loadUser(req.userId)) });
});

router.put("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.userId]);
  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect." });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.userId]);
  res.json({ status: "updated" });
});

module.exports = router;
