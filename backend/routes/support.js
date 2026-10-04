const express = require("express");
const pool = require("../db");
const { requireAuth, requireEditor } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireEditor);

const STATUSES = ["open", "pending", "resolved"];

router.get("/", async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = "";
  if (status && STATUSES.includes(status)) {
    params.push(status);
    where = `WHERE t.status = $1`;
  }
  const result = await pool.query(
    `SELECT t.id, t.subject, t.region, t.status, t.created_at,
            t.customer_id, c.name AS customer_name
     FROM support_tickets t
     LEFT JOIN customers c ON c.id = t.customer_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ tickets: result.rows });
});

router.post("/", async (req, res) => {
  const { subject, customerId, region } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: "Subject is required." });
  if (!customerId) return res.status(400).json({ error: "A customer is required." });

  const customer = await pool.query(`SELECT id, name, region FROM customers WHERE id = $1`, [customerId]);
  if (!customer.rows.length) return res.status(404).json({ error: "Customer not found." });

  const result = await pool.query(
    `INSERT INTO support_tickets (subject, customer_id, region, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING id, subject, region, status, created_at, customer_id`,
    [subject.trim(), customerId, region || customer.rows[0].region]
  );
  res.status(201).json({ ticket: { ...result.rows[0], customer_name: customer.rows[0].name } });
});

router.put("/:id", async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
  }
  const result = await pool.query(
    `UPDATE support_tickets SET status = $1 WHERE id = $2
     RETURNING id, subject, region, status, created_at, customer_id`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Ticket not found." });
  res.json({ ticket: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const result = await pool.query(`DELETE FROM support_tickets WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Ticket not found." });
  res.json({ status: "deleted" });
});

module.exports = router;
