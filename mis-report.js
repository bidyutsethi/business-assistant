// Generates a real MIS report from the Business Assistant API.
(function () {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const num = new Intl.NumberFormat("en-US");

  function deltaHtml(pct) {
    const sign = pct >= 0 ? "+" : "";
    return `<div class="delta ${pct >= 0 ? "up" : "down"}">${sign}${pct.toFixed(1)}%</div>`;
  }

  function renderKpis(container, kpis) {
    container.innerHTML = `
      <div class="kpi-card"><div class="label">Revenue</div><div class="value">${money.format(kpis.revenue)}</div>${deltaHtml(kpis.revenueGrowthPct)}</div>
      <div class="kpi-card"><div class="label">Orders</div><div class="value">${num.format(kpis.orders)}</div>${deltaHtml(kpis.ordersGrowthPct)}</div>
      <div class="kpi-card"><div class="label">Active Customers</div><div class="value">${num.format(kpis.customers)}</div><div class="delta up">&nbsp;</div></div>
      <div class="kpi-card"><div class="label">Support Tickets</div><div class="value">${num.format(kpis.tickets)}</div>${deltaHtml(kpis.ticketsGrowthPct)}</div>
    `;
  }

  function renderList(container, items, iconSvg, colorVar) {
    if (!items.length) {
      container.innerHTML = `<p style="font-size:13.5px;color:var(--slate-400);">Nothing to show.</p>`;
      return;
    }
    container.innerHTML = items
      .map(
        (text) =>
          `<div class="risk-item" style="color:var(--navy-700);"><svg viewBox="0 0 24 24" fill="none" stroke="${colorVar}" stroke-width="2">${iconSvg}</svg>${text}</div>`
      )
      .join("");
  }

  const RISK_ICON = '<path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>';
  const REC_ICON = '<path d="M20 6 9 17l-5-5"/>';

  const RANGE_LABELS = { this_month: "This month", last_month: "Last month", last_quarter: "Last quarter" };

  async function generate() {
    const range = document.getElementById("reportRange").value;
    const region = document.getElementById("reportRegion").value;
    const btn = document.querySelector('#reportGenForm button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating...";

    const output = document.getElementById("reportOutput");
    const emptyState = document.getElementById("reportEmpty");
    emptyState.hidden = true;

    try {
      const params = new URLSearchParams({ range });
      if (region) params.set("region", region);
      const report = await baFetch(`/reports/generate?${params.toString()}`);

      document.getElementById("reportTitle").textContent = `${RANGE_LABELS[range]} Management Report`;
      document.getElementById("reportMeta").textContent =
        `Generated from live data · ${report.region} · ${RANGE_LABELS[range]}`;
      document.getElementById("reportSummary").textContent = report.executiveSummary;
      renderKpis(document.getElementById("reportKpis"), report.kpis);
      document.getElementById("reportPerformance").textContent = report.performanceAnalysis;
      renderLineChart(document.getElementById("reportTrendChart"), report.trend, "revenue");
      renderList(document.getElementById("reportRisks"), report.risks, RISK_ICON, "var(--danger)");
      renderList(document.getElementById("reportRecommendations"), report.recommendations, REC_ICON, "var(--accent)");

      output.hidden = false;
      output.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      output.hidden = true;
      emptyState.hidden = false;
      document.getElementById("reportEmptyMsg").textContent = err.message || "Could not reach the API.";
      showToast("Couldn't generate the report.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("reportGenForm");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      generate();
    });
    generate();
  });
})();
