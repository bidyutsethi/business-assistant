const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function pctChange(curr, prev) {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
}

router.get("/summary", async (req, res) => {
  const [
    revenueRows,
    prevRevenueRows,
    ordersRows,
    prevOrdersRows,
    customersRows,
    prevCustomersRows,
    ticketsRows,
    prevTicketsRows,
    tasksRows,
  ] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM orders
       WHERE date_trunc('month', created_at) = date_trunc('month', now())`
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM orders
       WHERE date_trunc('month', created_at) = date_trunc('month', now() - interval '1 month')`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM orders
       WHERE date_trunc('month', created_at) = date_trunc('month', now())`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM orders
       WHERE date_trunc('month', created_at) = date_trunc('month', now() - interval '1 month')`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM customers WHERE created_at <= date_trunc('month', now()) + interval '1 month'`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM customers WHERE created_at <= date_trunc('month', now())`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM support_tickets WHERE created_at >= now() - interval '7 days'`
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM support_tickets
       WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days'`
    ),
    pool.query(`SELECT COUNT(*) AS count FROM tasks WHERE status != 'done'`),
  ]);

  const revenue = Number(revenueRows.rows[0].total);
  const prevRevenue = Number(prevRevenueRows.rows[0].total);
  const orders = Number(ordersRows.rows[0].count);
  const prevOrders = Number(prevOrdersRows.rows[0].count);
  const customers = Number(customersRows.rows[0].count);
  const prevCustomers = Number(prevCustomersRows.rows[0].count);
  const ticketsThisWeek = Number(ticketsRows.rows[0].count);
  const ticketsPrevWeek = Number(prevTicketsRows.rows[0].count);
  const pendingTasks = Number(tasksRows.rows[0].count);

  res.json({
    revenue,
    revenueGrowthPct: pctChange(revenue, prevRevenue),
    orders,
    ordersGrowthPct: pctChange(orders, prevOrders),
    customers,
    customersGrowthPct: pctChange(customers, prevCustomers),
    supportTickets: ticketsThisWeek,
    supportGrowthPct: pctChange(ticketsThisWeek, ticketsPrevWeek),
    pendingTasks,
  });
});

router.get("/revenue-trend", async (req, res) => {
  const result = await pool.query(
    `SELECT to_char(date_trunc('month', created_at), 'Mon') AS month,
            SUM(amount) AS total
     FROM orders
     WHERE created_at >= date_trunc('month', now()) - interval '5 months'
     GROUP BY date_trunc('month', created_at)
     ORDER BY date_trunc('month', created_at) ASC`
  );
  res.json({ trend: result.rows.map((r) => ({ month: r.month, revenue: Number(r.total) })) });
});

router.get("/recent-orders", async (req, res) => {
  const result = await pool.query(
    `SELECT o.order_number, c.name AS customer_name, o.amount, o.status, o.created_at
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     ORDER BY o.created_at DESC
     LIMIT 6`
  );
  res.json({ orders: result.rows });
});

router.get("/tasks", async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, status FROM tasks WHERE status != 'done' ORDER BY created_at DESC LIMIT 6`
  );
  res.json({ tasks: result.rows });
});

router.get("/insights", async (req, res) => {
  const regionResult = await pool.query(
    `SELECT region, COUNT(*) AS count
     FROM support_tickets
     WHERE created_at >= now() - interval '7 days'
     GROUP BY region
     ORDER BY count DESC
     LIMIT 1`
  );
  const topRegion = regionResult.rows[0];

  const growthResult = await pool.query(
    `SELECT
       SUM(CASE WHEN created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days' THEN amount ELSE 0 END) AS prev_week,
       SUM(CASE WHEN created_at >= now() - interval '7 days' THEN amount ELSE 0 END) AS curr_week
     FROM orders`
  );
  const g = growthResult.rows[0];
  const currWeek = Number(g.curr_week || 0);
  const prevWeek = Number(g.prev_week || 0);
  const weekGrowthPct = pctChange(currWeek, prevWeek);

  res.json({
    insight: `Revenue this week is ${weekGrowthPct >= 0 ? "up" : "down"} ${Math.abs(weekGrowthPct).toFixed(1)}% versus last week.`,
    risk: topRegion
      ? `${topRegion.region} generated the most support tickets this week (${topRegion.count}).`
      : "No support ticket activity in the last 7 days.",
  });
});

module.exports = router;
