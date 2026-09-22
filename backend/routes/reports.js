const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const REGIONS = ["North America", "Europe", "APAC"];

function startOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 1));
}

function getRangeBounds(range) {
  const now = new Date();
  let start, end, prevStart, prevEnd, label;

  if (range === "last_month") {
    end = startOfMonth(now.getUTCFullYear(), now.getUTCMonth());
    start = startOfMonth(end.getUTCFullYear(), end.getUTCMonth() - 1);
    prevEnd = start;
    prevStart = startOfMonth(start.getUTCFullYear(), start.getUTCMonth() - 1);
    label = "Last month";
  } else if (range === "last_quarter") {
    end = startOfMonth(now.getUTCFullYear(), now.getUTCMonth());
    start = startOfMonth(end.getUTCFullYear(), end.getUTCMonth() - 3);
    prevEnd = start;
    prevStart = startOfMonth(start.getUTCFullYear(), start.getUTCMonth() - 3);
    label = "Last quarter";
  } else {
    start = startOfMonth(now.getUTCFullYear(), now.getUTCMonth());
    end = startOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 1);
    prevStart = startOfMonth(start.getUTCFullYear(), start.getUTCMonth() - 1);
    prevEnd = start;
    label = "This month";
  }
  return { start, end, prevStart, prevEnd, label };
}

function pctChange(curr, prev) {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
}

function money(n) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

router.get("/generate", async (req, res) => {
  const range = ["this_month", "last_month", "last_quarter"].includes(req.query.range)
    ? req.query.range
    : "this_month";
  const region = REGIONS.includes(req.query.region) ? req.query.region : null;
  const { start, end, prevStart, prevEnd, label } = getRangeBounds(range);

  const regionFilter = region ? "AND region = $3" : "";
  const bounds = (s, e) => (region ? [s, e, region] : [s, e]);

  const [
    revenueCurr,
    revenuePrev,
    ordersCurr,
    ordersPrev,
    activeCustomers,
    ticketsCurr,
    ticketsPrev,
    tasksOpen,
    regionBreakdown,
    trendRows,
  ] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(start, end)),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(prevStart, prevEnd)),
    pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(start, end)),
    pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(prevStart, prevEnd)),
    pool.query(`SELECT COUNT(DISTINCT customer_id)::int AS count FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(start, end)),
    pool.query(`SELECT COUNT(*)::int AS count FROM support_tickets WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(start, end)),
    pool.query(`SELECT COUNT(*)::int AS count FROM support_tickets WHERE created_at >= $1 AND created_at < $2 ${regionFilter}`, bounds(prevStart, prevEnd)),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE status != 'done'`),
    pool.query(
      `SELECT region, COALESCE(SUM(amount),0) AS total FROM orders
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY region`,
      [start, end]
    ),
    pool.query(
      `SELECT date_trunc('week', created_at) AS week, SUM(amount) AS total
       FROM orders WHERE created_at >= $1 AND created_at < $2 ${regionFilter}
       GROUP BY date_trunc('week', created_at)
       ORDER BY date_trunc('week', created_at) ASC`,
      bounds(start, end)
    ),
  ]);

  const revenue = Number(revenueCurr.rows[0].total);
  const prevRevenue = Number(revenuePrev.rows[0].total);
  const orders = ordersCurr.rows[0].count;
  const prevOrders = ordersPrev.rows[0].count;
  const customers = activeCustomers.rows[0].count;
  const tickets = ticketsCurr.rows[0].count;
  const prevTickets = ticketsPrev.rows[0].count;
  const pendingTasks = tasksOpen.rows[0].count;

  const revenueGrowthPct = pctChange(revenue, prevRevenue);
  const ordersGrowthPct = pctChange(orders, prevOrders);
  const ticketsGrowthPct = pctChange(tickets, prevTickets);

  const regionTotals = regionBreakdown.rows.map((r) => ({ region: r.region, total: Number(r.total) }));
  const totalForShare = regionTotals.reduce((sum, r) => sum + r.total, 0) || 1;
  const regionShares = regionTotals
    .map((r) => ({ ...r, share: (r.total / totalForShare) * 100 }))
    .sort((a, b) => b.total - a.total);

  const bestRegion = regionShares[0];
  const worstRegion = regionShares[regionShares.length - 1];

  const risks = [];
  const recommendations = [];

  if (revenueGrowthPct < 0) {
    risks.push(`Revenue is down ${Math.abs(revenueGrowthPct).toFixed(1)}% compared with the prior period.`);
    recommendations.push("Review pricing and top accounts to identify what's driving the revenue decline.");
  }
  if (ticketsGrowthPct > 15) {
    risks.push(`Support ticket volume rose ${ticketsGrowthPct.toFixed(1)}% compared with the prior period.`);
    recommendations.push("Add temporary support coverage and review common ticket subjects for a root cause.");
  }
  if (pendingTasks > 10) {
    risks.push(`${pendingTasks} tasks are currently pending across the team.`);
    recommendations.push("Triage the task backlog and reassign anything overdue.");
  }
  if (!region && worstRegion && regionShares.length > 1 && worstRegion.share < 15) {
    risks.push(`${worstRegion.region} contributed only ${worstRegion.share.toFixed(1)}% of revenue this period.`);
  }
  if (!region && bestRegion) {
    recommendations.push(
      `Replicate what's working in ${bestRegion.region} — it generated the most revenue this period (${bestRegion.share.toFixed(1)}% of the total).`
    );
  }
  if (!risks.length) risks.push("No significant risks were detected in this period's data.");
  if (!recommendations.length) recommendations.push("Performance is on track — no specific actions flagged this period.");

  const executiveSummary =
    `${label} revenue was ${money(revenue)}, ${revenueGrowthPct >= 0 ? "up" : "down"} ` +
    `${Math.abs(revenueGrowthPct).toFixed(1)}% versus the prior period. ${orders} orders were placed across ` +
    `${customers} active customers, and ${tickets} support tickets were opened` +
    (!region && bestRegion ? `. ${bestRegion.region} was the strongest-performing region.` : ".");

  const performanceAnalysis = region
    ? `${region} generated ${money(revenue)} in revenue this period, ${revenueGrowthPct >= 0 ? "up" : "down"} ${Math.abs(revenueGrowthPct).toFixed(1)}% versus the prior period.`
    : regionShares
        .map((r) => `${r.region} generated ${money(r.total)} (${r.share.toFixed(1)}% of revenue).`)
        .join(" ");

  res.json({
    reportLabel: label,
    region: region || "All regions",
    generatedAt: new Date().toISOString(),
    executiveSummary,
    kpis: { revenue, revenueGrowthPct, orders, ordersGrowthPct, customers, tickets, ticketsGrowthPct },
    performanceAnalysis,
    trend: trendRows.rows.map((r) => ({
      week: new Date(r.week).toISOString().slice(0, 10),
      revenue: Number(r.total),
    })),
    risks,
    recommendations,
  });
});

module.exports = router;
