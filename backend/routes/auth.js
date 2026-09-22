const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

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
  };
}

router.post("/signup", async (req, res) => {
  const { fullName, company, email, password } = req.body || {};

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

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, company, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, company, email, role`,
    [fullName, company || null, normalizedEmail, passwordHash]
  );

  const user = result.rows[0];
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, full_name, company, email, role FROM users WHERE id = $1",
    [req.userId]
  );
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  res.json({ user: publicUser(user) });
});

router.put("/me", requireAuth, async (req, res) => {
  const { fullName, company } = req.body || {};
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: "Full name is required." });
  }
  const result = await pool.query(
    `UPDATE users SET full_name = $1, company = $2 WHERE id = $3
     RETURNING id, full_name, company, email, role`,
    [fullName.trim(), company ? company.trim() : null, req.userId]
  );
  res.json({ user: publicUser(result.rows[0]) });
});

router.put("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: "User not found." });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect." });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.userId]);
  res.json({ status: "updated" });
});

module.exports = router;
