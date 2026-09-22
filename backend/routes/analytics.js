const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const [revenueTrend, ordersByStatus, revenueByRegion, customersByMonth, ticketTrend] = await Promise.all([
    pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon') AS month, SUM(amount) AS total
       FROM orders WHERE created_at >= date_trunc('month', now()) - interval '5 months'
       GROUP BY date_trunc('month', created_at)
       ORDER BY date_trunc('month', created_at) ASC`
    ),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`),
    pool.query(
      `SELECT region, COALESCE(SUM(amount), 0) AS total FROM orders
       WHERE created_at >= date_trunc('month', now()) - interval '5 months'
       GROUP BY region ORDER BY total DESC`
    ),
    pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon') AS month, COUNT(*)::int AS count
       FROM customers WHERE created_at >= date_trunc('month', now()) - interval '5 months'
       GROUP BY date_trunc('month', created_at)
       ORDER BY date_trunc('month', created_at) ASC`
    ),
    pool.query(
      `SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
       FROM support_tickets WHERE created_at >= now() - interval '30 days'
       GROUP BY date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at) ASC`
    ),
  ]);

  let cumulative = 0;
  const customerGrowth = customersByMonth.rows.map((r) => {
    cumulative += r.count;
    return { month: r.month, customers: cumulative };
  });

  res.json({
    revenueTrend: revenueTrend.rows.map((r) => ({ month: r.month, revenue: Number(r.total) })),
    ordersByStatus: ordersByStatus.rows,
    revenueByRegion: revenueByRegion.rows.map((r) => ({ region: r.region, total: Number(r.total) })),
    customerGrowth,
    ticketTrend: ticketTrend.rows.map((r) => ({
      day: new Date(r.day).toISOString().slice(0, 10),
      count: r.count,
    })),
  });
});

module.exports = router;
