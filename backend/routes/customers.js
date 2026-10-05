const express = require("express");
const pool = require("../db");
const { requireAuth, requireEditor } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireEditor);

const REGIONS = ["North America", "Europe", "APAC"];

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.name, c.region, c.created_at,
            COUNT(o.id)::int AS order_count,
            COALESCE(SUM(o.amount), 0) AS total_spend
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
     WHERE c.workspace_id = $1
     GROUP BY c.id, c.name, c.region, c.created_at
     ORDER BY c.created_at DESC`,
    [req.workspaceId]
  );
  res.json({
    customers: result.rows.map((r) => ({ ...r, total_spend: Number(r.total_spend) })),
  });
});

router.post("/", async (req, res) => {
  const { name, region } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Customer name is required." });
  }
  if (!REGIONS.includes(region)) {
    return res.status(400).json({ error: `Region must be one of: ${REGIONS.join(", ")}.` });
  }
  const result = await pool.query(
    `INSERT INTO customers (workspace_id, name, region) VALUES ($1, $2, $3) RETURNING id, name, region, created_at`,
    [req.workspaceId, name.trim(), region]
  );
  res.status(201).json({ customer: { ...result.rows[0], order_count: 0, total_spend: 0 } });
});

router.put("/:id", async (req, res) => {
  const { name, region } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Customer name is required." });
  }
  if (!REGIONS.includes(region)) {
    return res.status(400).json({ error: `Region must be one of: ${REGIONS.join(", ")}.` });
  }
  const result = await pool.query(
    `UPDATE customers SET name = $1, region = $2 WHERE id = $3 AND workspace_id = $4
     RETURNING id, name, region, created_at`,
    [name.trim(), region, req.params.id, req.workspaceId]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Customer not found." });
  res.json({ customer: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const owned = await pool.query(`SELECT id FROM customers WHERE id = $1 AND workspace_id = $2`, [
    req.params.id,
    req.workspaceId,
  ]);
  if (!owned.rows.length) return res.status(404).json({ error: "Customer not found." });

  const inUse = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE customer_id = $1) AS orders,
       (SELECT COUNT(*) FROM support_tickets WHERE customer_id = $1) AS tickets`,
    [req.params.id]
  );
  const { orders, tickets } = inUse.rows[0];
  if (Number(orders) > 0 || Number(tickets) > 0) {
    return res.status(409).json({
      error: `Can't delete this customer: they have ${orders} order(s) and ${tickets} ticket(s) on record. Remove those first.`,
    });
  }
  await pool.query(`DELETE FROM customers WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.workspaceId]);
  res.json({ status: "deleted" });
});

module.exports = router;
