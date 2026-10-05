const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Built-in assistant: matches the question against a set of known topics and
// answers each one from live data. No AI model is involved, so it costs
// nothing to run — the trade-off is it only understands the topics below.
// A reply is { reply, stats?, link?, confirm? }:
//   stats   — [{ label, value }] rows shown under the reply
//   link    — { href, label } to the page with the full picture
//   confirm — a change the user must approve; the frontend applies it through
//             the normal API (so permissions are enforced there), never here.

const ORDER_STATUSES = ["new", "processing", "fulfilled", "overdue"];
const DAY_MS = 24 * 60 * 60 * 1000;

function money(n) {
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function pctChange(curr, prev) {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  return curr > 0 ? 100 : 0;
}

function trend(pct) {
  return `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}%`;
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { start, end, prevStart };
}

function daysAgo(n) {
  return new Date(Date.now() - n * DAY_MS);
}

async function revenueBetween(ws, start, end) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count
     FROM orders WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3`,
    [ws, start, end]
  );
  return { total: Number(result.rows[0].total), count: result.rows[0].count };
}

async function ticketsBetween(ws, start, end) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM support_tickets WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3`,
    [ws, start, end]
  );
  return result.rows[0].count;
}

async function findOrder(ws, number) {
  const result = await pool.query(
    `SELECT o.id, o.order_number, o.amount, o.status, o.region, o.created_at, c.name AS customer_name
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.workspace_id = $1 AND o.order_number = $2`,
    [ws, `#${number}`]
  );
  return result.rows[0];
}

async function answerRevenue(ws) {
  const { start, end, prevStart } = monthBounds();
  const [curr, prev] = await Promise.all([revenueBetween(ws, start, end), revenueBetween(ws, prevStart, start)]);
  return {
    reply: `Revenue this month is ${money(curr.total)} from ${curr.count} orders — ${trend(
      pctChange(curr.total, prev.total)
    )} versus last month (${money(prev.total)}).`,
    stats: [
      { label: "This month", value: money(curr.total) },
      { label: "Last month", value: money(prev.total) },
      { label: "Orders this month", value: String(curr.count) },
      { label: "Average order", value: money(curr.count ? curr.total / curr.count : 0) },
    ],
    link: { href: "analytics.html", label: "Open Analytics" },
  };
}

async function answerOrders(ws) {
  const { start, end } = monthBounds();
  const [curr, byStatus] = await Promise.all([
    revenueBetween(ws, start, end),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM orders WHERE workspace_id = $1 GROUP BY status`, [ws]),
  ]);
  const counts = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count]));
  return {
    reply: `${curr.count} orders have been placed this month, worth ${money(curr.total)}. Here is how all orders stand right now:`,
    stats: ORDER_STATUSES.map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: String(counts[s] || 0) })),
    link: { href: "orders.html", label: "Open Orders" },
  };
}

async function answerOrderLookup(ws, number) {
  const order = await findOrder(ws, number);
  if (!order) return { reply: `I couldn't find order #${number}.`, link: { href: "orders.html", label: "Open Orders" } };
  return {
    reply: `Order ${order.order_number} is for ${order.customer_name}.`,
    stats: [
      { label: "Amount", value: money(order.amount) },
      { label: "Status", value: order.status },
      { label: "Region", value: order.region },
      { label: "Placed", value: new Date(order.created_at).toISOString().slice(0, 10) },
    ],
    link: { href: "orders.html", label: "Open Orders" },
  };
}

async function answerOrderStatusChange(ws, number, status) {
  const order = await findOrder(ws, number);
  if (!order) return { reply: `I couldn't find order #${number}.` };
  if (order.status === status) {
    return { reply: `Order ${order.order_number} is already marked ${status}.` };
  }
  return {
    reply: `I found order ${order.order_number} for ${order.customer_name} (${money(order.amount)}), currently ${order.status}.`,
    confirm: {
      type: "order_status",
      orderId: order.id,
      status,
      prompt: `Mark order ${order.order_number} (${order.customer_name}) as ${status}?`,
      confirmLabel: `Mark ${status}`,
    },
  };
}

async function answerOverdue(ws) {
  const result = await pool.query(
    `SELECT c.name, COUNT(o.id)::int AS count, COALESCE(SUM(o.amount), 0) AS total
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.workspace_id = $1 AND o.status = 'overdue'
     GROUP BY c.name`,
    [ws]
  );
  const rows = result.rows.map((r) => ({ ...r, total: Number(r.total) })).sort((a, b) => b.total - a.total);
  if (!rows.length) return { reply: "No orders are overdue right now — nothing is waiting on payment." };
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return {
    reply: `${rows.length} customers have overdue orders, ${money(total)} outstanding in total. The largest balances:`,
    stats: rows.slice(0, 6).map((r) => ({ label: `${r.name} (${r.count})`, value: money(r.total) })),
    link: { href: "orders.html", label: "Open Orders" },
  };
}

async function answerUnusual(ws) {
  const result = await pool.query(
    `SELECT o.order_number, o.amount, c.name AS customer_name
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.workspace_id = $1 AND o.created_at >= $2
     ORDER BY o.created_at DESC
     LIMIT 2000`,
    [ws, daysAgo(30)]
  );
  const orders = result.rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  if (orders.length < 5) {
    return { reply: "There aren't enough orders in the last 30 days to judge what's unusual." };
  }
  const mean = orders.reduce((sum, o) => sum + o.amount, 0) / orders.length;
  const sd = Math.sqrt(orders.reduce((sum, o) => sum + (o.amount - mean) ** 2, 0) / orders.length);
  const outliers = orders.filter((o) => o.amount > mean + 2 * sd).sort((a, b) => b.amount - a.amount);
  if (!outliers.length) {
    return {
      reply: `Nothing stands out: across ${orders.length} orders in the last 30 days (average ${money(mean)}), none is unusually large.`,
    };
  }
  return {
    reply: `${outliers.length} of the last ${orders.length} orders are unusually large — well above the 30-day average of ${money(mean)}:`,
    stats: outliers.slice(0, 6).map((o) => ({ label: `${o.order_number} · ${o.customer_name}`, value: money(o.amount) })),
    link: { href: "orders.html", label: "Open Orders" },
  };
}

async function answerTickets(ws) {
  const now = new Date();
  const [thisWeek, lastWeek, byStatus, byRegion, bySubject] = await Promise.all([
    ticketsBetween(ws, daysAgo(7), now),
    ticketsBetween(ws, daysAgo(14), daysAgo(7)),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM support_tickets WHERE workspace_id = $1 GROUP BY status`, [ws]),
    pool.query(`SELECT region, COUNT(*)::int AS count FROM support_tickets WHERE workspace_id = $1 AND created_at >= $2 GROUP BY region`, [ws, daysAgo(7)]),
    pool.query(`SELECT subject, COUNT(*)::int AS count FROM support_tickets WHERE workspace_id = $1 AND created_at >= $2 GROUP BY subject`, [ws, daysAgo(7)]),
  ]);
  const counts = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count]));
  const topRegion = byRegion.rows.sort((a, b) => b.count - a.count)[0];
  const topSubject = bySubject.rows.sort((a, b) => b.count - a.count)[0];

  let reply = `${thisWeek} support tickets were opened in the last 7 days, ${trend(pctChange(thisWeek, lastWeek))} on the week before (${lastWeek}).`;
  if (topRegion) reply += ` Most came from ${topRegion.region} (${topRegion.count})`;
  if (topRegion && topSubject) reply += `, and the most common subject was "${topSubject.subject}" (${topSubject.count}).`;
  else if (topRegion) reply += ".";

  return {
    reply,
    stats: [
      { label: "Open", value: String(counts.open || 0) },
      { label: "Pending", value: String(counts.pending || 0) },
      { label: "Resolved", value: String(counts.resolved || 0) },
    ],
    link: { href: "support.html", label: "Open Support" },
  };
}

async function answerTasks(ws) {
  const result = await pool.query(
    `SELECT title, status FROM tasks WHERE workspace_id = $1 AND status != 'done' ORDER BY created_at DESC`,
    [ws]
  );
  const tasks = result.rows;
  if (!tasks.length) return { reply: "There are no pending tasks — everything is done." };
  const approvals = tasks.filter((t) => t.status === "approval");
  const list = approvals.length ? approvals : tasks;
  return {
    reply: approvals.length
      ? `${tasks.length} tasks are pending, and ${approvals.length} of them need approval:`
      : `${tasks.length} tasks are pending. None are waiting for approval. The most recent:`,
    stats: list.slice(0, 6).map((t) => ({ label: t.title, value: t.status })),
    link: { href: "tasks.html", label: "Open Tasks" },
  };
}

async function answerRegions(ws) {
  const { start, end } = monthBounds();
  const [revenue, tickets] = await Promise.all([
    pool.query(
      `SELECT region, COALESCE(SUM(amount), 0) AS total FROM orders
       WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY region`,
      [ws, start, end]
    ),
    pool.query(`SELECT region, COUNT(*)::int AS count FROM support_tickets WHERE workspace_id = $1 AND created_at >= $2 GROUP BY region`, [ws, daysAgo(7)]),
  ]);
  const regions = revenue.rows.map((r) => ({ region: r.region, total: Number(r.total) })).sort((a, b) => b.total - a.total);
  if (!regions.length) return { reply: "There are no orders this month yet, so there's nothing to compare by region." };
  const weakest = regions[regions.length - 1];
  const busiest = tickets.rows.sort((a, b) => b.count - a.count)[0];

  let reply = `${regions[0].region} leads revenue this month with ${money(regions[0].total)}.`;
  if (regions.length > 1) reply += ` ${weakest.region} is the weakest at ${money(weakest.total)}.`;
  if (busiest) reply += ` ${busiest.region} raised the most support tickets this week (${busiest.count}), so it may need attention.`;

  return {
    reply,
    stats: regions.map((r) => ({ label: r.region, value: money(r.total) })),
    link: { href: "analytics.html", label: "Open Analytics" },
  };
}

async function answerTopCustomers(ws) {
  const result = await pool.query(
    `SELECT c.name, COUNT(o.id)::int AS count, COALESCE(SUM(o.amount), 0) AS total
     FROM customers c JOIN orders o ON o.customer_id = c.id
     WHERE c.workspace_id = $1
     GROUP BY c.name`,
    [ws]
  );
  const rows = result.rows.map((r) => ({ ...r, total: Number(r.total) })).sort((a, b) => b.total - a.total);
  if (!rows.length) return { reply: "No customers have placed orders yet." };
  return {
    reply: `Your top customers by total spend — ${rows[0].name} is first with ${money(rows[0].total)}:`,
    stats: rows.slice(0, 5).map((r) => ({ label: `${r.name} (${r.count} orders)`, value: money(r.total) })),
    link: { href: "customers.html", label: "Open Customers" },
  };
}

async function answerCustomers(ws) {
  const { start } = monthBounds();
  const [all, fresh, byRegion] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE workspace_id = $1`, [ws]),
    pool.query(`SELECT COUNT(*)::int AS count FROM customers WHERE workspace_id = $1 AND created_at >= $2`, [ws, start]),
    pool.query(`SELECT region, COUNT(*)::int AS count FROM customers WHERE workspace_id = $1 GROUP BY region`, [ws]),
  ]);
  return {
    reply: `You have ${all.rows[0].count} customers, ${fresh.rows[0].count} of them added this month.`,
    stats: byRegion.rows.sort((a, b) => b.count - a.count).map((r) => ({ label: r.region, value: String(r.count) })),
    link: { href: "customers.html", label: "Open Customers" },
  };
}

async function answerReport(ws) {
  const { start, end, prevStart } = monthBounds();
  const now = new Date();
  const [curr, prev, tickets, tasks] = await Promise.all([
    revenueBetween(ws, start, end),
    revenueBetween(ws, prevStart, start),
    ticketsBetween(ws, start, now),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE workspace_id = $1 AND status != 'done'`, [ws]),
  ]);
  return {
    reply: `Here is this month so far: revenue is ${money(curr.total)}, ${trend(
      pctChange(curr.total, prev.total)
    )} versus last month. The full MIS report has the regional breakdown, risks and recommendations.`,
    stats: [
      { label: "Revenue", value: money(curr.total) },
      { label: "Orders", value: String(curr.count) },
      { label: "Support tickets", value: String(tickets) },
      { label: "Pending tasks", value: String(tasks.rows[0].count) },
    ],
    link: { href: "mis-report.html", label: "Open the full MIS report" },
  };
}

function answerHelp(prefix) {
  return {
    reply:
      (prefix ? `${prefix} ` : "") +
      "I can answer from your live data about: revenue and sales, orders (try \"order #10450\"), overdue payments, " +
      "unusual orders, customers and top customers, regions, support tickets, tasks and approvals, and the monthly report. " +
      "I can also update an order, for example \"mark order #10450 as fulfilled\".",
  };
}

async function answer(ws, message) {
  const text = message.toLowerCase();
  const orderRef = text.match(/order\s*(?:number\s*)?#?\s*(\d{3,})/);
  const status = ORDER_STATUSES.find((s) => new RegExp(`\\b${s}\\b`).test(text));

  if (orderRef && status && /\b(mark|set|change|update|move|make)\b/.test(text)) {
    return answerOrderStatusChange(ws, orderRef[1], status);
  }
  if (/\brefund/.test(text)) {
    return {
      reply:
        "Refunds aren't tracked in this workspace yet, so I can't issue one. I can change an order's status instead — " +
        'for example "mark order #10450 as overdue".',
    };
  }
  if (orderRef) return answerOrderLookup(ws, orderRef[1]);
  if (/\b(mis|report|summary|overview)\b/.test(text)) return answerReport(ws);
  if (/overdue|unpaid|outstanding|pending payment|late payment/.test(text)) return answerOverdue(ws);
  if (/unusual|anomal|outlier|suspicious|strange|odd\b/.test(text)) return answerUnusual(ws);
  if (/ticket|support|complaint|helpdesk/.test(text)) return answerTickets(ws);
  if (/task|approval|approve|to-?do/.test(text)) return answerTasks(ws);
  if (/region|country|territor|\bapac\b|europe|america/.test(text)) return answerRegions(ws);
  if (/(top|best|biggest|largest|key)\b.*(customer|client|account)/.test(text)) return answerTopCustomers(ws);
  if (/customer|client/.test(text)) return answerCustomers(ws);
  if (/revenue|sales|income|earning|turnover/.test(text)) return answerRevenue(ws);
  if (/order/.test(text)) return answerOrders(ws);
  if (/product|item|sku|inventory|stock/.test(text)) {
    return { reply: "This workspace doesn't track products yet — orders are recorded by customer and amount only. I can show top customers or revenue instead." };
  }
  if (/^(hi|hello|hey|help|good (morning|afternoon|evening))\b|what can you/.test(text)) return answerHelp("Hello!");
  return answerHelp("I'm not sure how to answer that.");
}

router.post("/ask", async (req, res) => {
  const message = String((req.body || {}).message || "").trim();
  if (!message) return res.status(400).json({ error: "Type a question first." });
  if (message.length > 500) return res.status(400).json({ error: "That question is too long." });
  res.json(await answer(req.workspaceId, message));
});

module.exports = router;
