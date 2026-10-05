const express = require("express");
const pool = require("../db");
const { requireAuth, requireSiteOwner } = require("../middleware/auth");

const router = express.Router();

// "Book a Demo" / "Contact Sales" requests from the public marketing site.
// Anyone can submit one (no account needed); only the site owner — an admin
// of the oldest workspace — can read them. They're leads for whoever runs
// this site, so they deliberately aren't part of any customer's workspace.

const KINDS = ["demo", "sales"];
const STATUSES = ["new", "contacted", "closed"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The form is public, so cap how many requests one address can send. Kept in
// memory: good enough to stop a casual flood, and it resets on restart.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const recentByIp = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    recentByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentByIp.set(ip, recent);
  // Don't let the map grow forever on a long-running server.
  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) recentByIp.delete(key);
    }
  }
  return false;
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

router.post("/", async (req, res) => {
  const body = req.body || {};

  // Honeypot: the form has a hidden "website" field real visitors never see.
  // A bot that fills it in gets a normal-looking success, and nothing is saved.
  if (body.website) return res.status(201).json({ status: "received" });

  const fullName = clean(body.fullName, 120);
  const email = clean(body.email, 200).toLowerCase();
  const company = clean(body.company, 160);
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 2000);
  const kind = KINDS.includes(body.kind) ? body.kind : "demo";

  if (!fullName) return res.status(400).json({ error: "Please enter your name." });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });

  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: "You've sent several requests already. Please try again a little later." });
  }

  await pool.query(
    `INSERT INTO demo_requests (full_name, email, company, phone, message, kind)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fullName, email, company || null, phone || null, message || null, kind]
  );
  res.status(201).json({ status: "received" });
});

router.get("/", requireAuth, requireSiteOwner, async (req, res) => {
  const result = await pool.query(
    `SELECT id, full_name, email, company, phone, message, kind, status, created_at
     FROM demo_requests ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ requests: result.rows });
});

router.put("/:id", requireAuth, requireSiteOwner, async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
  }
  const result = await pool.query(
    `UPDATE demo_requests SET status = $1 WHERE id = $2
     RETURNING id, full_name, email, company, phone, message, kind, status, created_at`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Request not found." });
  res.json({ request: result.rows[0] });
});

router.delete("/:id", requireAuth, requireSiteOwner, async (req, res) => {
  const result = await pool.query(`DELETE FROM demo_requests WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Request not found." });
  res.json({ status: "deleted" });
});

module.exports = router;
