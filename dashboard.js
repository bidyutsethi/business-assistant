// Fetches and renders live dashboard data from the Business Assistant API.
(function () {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const num = new Intl.NumberFormat("en-US");

  function setDelta(el, pct, suffix) {
    const sign = pct >= 0 ? "+" : "";
    el.textContent = `${sign}${pct.toFixed(1)}% ${suffix}`;
    el.classList.remove("up", "down");
    el.classList.add(pct >= 0 ? "up" : "down");
  }

  const ORDER_STATUS_MAP = {
    fulfilled: { cls: "resolved", label: "Fulfilled" },
    processing: { cls: "pending", label: "Processing" },
    new: { cls: "open", label: "New" },
    overdue: { cls: "overdue", label: "Payment overdue" },
  };

  const TASK_STATUS_MAP = {
    approval: { cls: "pending", label: "Approval" },
    open: { cls: "open", label: "Open" },
    scheduled: { cls: "resolved", label: "Scheduled" },
    done: { cls: "resolved", label: "Done" },
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderRecentOrders(container, orders) {
    if (!orders.length) {
      container.innerHTML = '<div class="list-row"><span style="color:var(--slate-400)">No orders yet.</span></div>';
      return;
    }
    container.innerHTML = orders
      .map((o) => {
        const meta = ORDER_STATUS_MAP[o.status] || { cls: "open", label: o.status };
        return `<div class="list-row"><span>${escapeHtml(o.order_number)} — ${escapeHtml(o.customer_name)}</span><span class="status-pill ${meta.cls}">${meta.label}</span></div>`;
      })
      .join("");
  }

  function renderTasks(container, tasks) {
    if (!tasks.length) {
      container.innerHTML = '<div class="list-row"><span style="color:var(--slate-400)">Nothing pending.</span></div>';
      return;
    }
    container.innerHTML = tasks
      .map((t) => {
        const meta = TASK_STATUS_MAP[t.status] || { cls: "open", label: t.status };
        return `<div class="list-row"><span>${escapeHtml(t.title)}</span><span class="status-pill ${meta.cls}">${meta.label}</span></div>`;
      })
      .join("");
  }

  async function load() {
    try {
      const [summary, trendRes, ordersRes, tasksRes, insights] = await Promise.all([
        baFetch("/dashboard/summary"),
        baFetch("/dashboard/revenue-trend"),
        baFetch("/dashboard/recent-orders"),
        baFetch("/dashboard/tasks"),
        baFetch("/dashboard/insights"),
      ]);

      const revenueEl = document.getElementById("kpiRevenue");
      revenueEl.textContent = money.format(summary.revenue);
      revenueEl.classList.remove("skeleton");
      setDelta(document.getElementById("kpiRevenueDelta"), summary.revenueGrowthPct, "vs last month");

      const ordersEl = document.getElementById("kpiOrders");
      ordersEl.textContent = num.format(summary.orders);
      ordersEl.classList.remove("skeleton");
      setDelta(document.getElementById("kpiOrdersDelta"), summary.ordersGrowthPct, "vs last month");

      const customersEl = document.getElementById("kpiCustomers");
      customersEl.textContent = num.format(summary.customers);
      customersEl.classList.remove("skeleton");
      setDelta(document.getElementById("kpiCustomersDelta"), summary.customersGrowthPct, "vs last month");

      const ticketsEl = document.getElementById("kpiTickets");
      ticketsEl.textContent = num.format(summary.supportTickets);
      ticketsEl.classList.remove("skeleton");
      setDelta(document.getElementById("kpiTicketsDelta"), summary.supportGrowthPct, "this week");

      renderLineChart(document.getElementById("revenueTrendChart"), trendRes.trend, "revenue");
      renderRecentOrders(document.getElementById("recentOrdersList"), ordersRes.orders);
      renderTasks(document.getElementById("pendingTasksList"), tasksRes.tasks);
      document.getElementById("taskCount").textContent = `${tasksRes.tasks.length} shown`;

      document.getElementById("insightText").textContent = insights.insight;
      document.getElementById("riskText").textContent = insights.risk;
    } catch (err) {
      console.error(err);
      document.getElementById("dashError").hidden = false;
      document.getElementById("dashErrorMsg").textContent =
        err.message || "Could not reach the API. Make sure the backend is running.";
      document.querySelectorAll(".kpi-row .value").forEach((el) => {
        el.textContent = "—";
        el.classList.remove("skeleton");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
