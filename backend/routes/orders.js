const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const STATUSES = ["new", "processing", "fulfilled", "overdue"];

router.get("/", async (req, res) => {
  const { status, region } = req.query;
  const conditions = [];
  const params = [];

  if (status && STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (region) {
    params.push(region);
    conditions.push(`o.region = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT o.id, o.order_number, o.amount, o.status, o.region, o.created_at,
            o.customer_id, c.name AS customer_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ orders: result.rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
});

router.post("/", async (req, res) => {
  const { customerId, amount, status, region } = req.body || {};
  const numAmount = Number(amount);

  if (!customerId) return res.status(400).json({ error: "A customer is required." });
  if (!numAmount || numAmount <= 0) return res.status(400).json({ error: "Enter a valid order amount." });
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
  }

  const customer = await pool.query(`SELECT id, name, region FROM customers WHERE id = $1`, [customerId]);
  if (!customer.rows.length) return res.status(404).json({ error: "Customer not found." });
  const orderRegion = region || customer.rows[0].region;

  // order_number depends on the new row's id, so insert first, then stamp it.
  const inserted = await pool.query(
    `INSERT INTO orders (order_number, customer_id, amount, status, region)
     VALUES ('', $1, $2, $3, $4)
     RETURNING id`,
    [customerId, numAmount, status, orderRegion]
  );
  const newId = inserted.rows[0].id;
  const orderNumber = `#${10420 + newId}`;
  const result = await pool.query(
    `UPDATE orders SET order_number = $1 WHERE id = $2
     RETURNING id, order_number, amount, status, region, created_at, customer_id`,
    [orderNumber, newId]
  );
  const order = result.rows[0];
  res.status(201).json({
    order: { ...order, amount: Number(order.amount), customer_name: customer.rows[0].name },
  });
});

router.put("/:id", async (req, res) => {
  const { status, amount } = req.body || {};
  const updates = [];
  const params = [];

  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
    }
    params.push(status);
    updates.push(`status = $${params.length}`);
  }
  if (amount !== undefined) {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return res.status(400).json({ error: "Enter a valid order amount." });
    params.push(numAmount);
    updates.push(`amount = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  params.push(req.params.id);
  const result = await pool.query(
    `UPDATE orders SET ${updates.join(", ")} WHERE id = $${params.length}
     RETURNING id, order_number, amount, status, region, created_at, customer_id`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: "Order not found." });
  const order = result.rows[0];
  res.json({ order: { ...order, amount: Number(order.amount) } });
});

router.delete("/:id", async (req, res) => {
  const result = await pool.query(`DELETE FROM orders WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Order not found." });
  res.json({ status: "deleted" });
});

module.exports = router;
